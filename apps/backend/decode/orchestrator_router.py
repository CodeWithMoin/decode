"""The orchestrator endpoint — the side chat's one turn.

`POST /projects/{id}/orchestrator/turn` takes a natural-language message and the
project's current scenes and returns a reply and, when the request maps to a tool,
a scoped proposal. Proposing changes nothing about the project: the proposal's
tool runs only when the creator clicks Apply, through that tool's own endpoint
(e.g. `/scene-visuals/regenerations`), which posts the receipt. The turn itself
is recorded as durable `chat.*` project events — the conversation is history,
not ephemera — which is why there is no idempotency key: appending to the log
twice records two turns, it cannot corrupt the project. See `orchestrator.py`.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session, utcnow
from .domain import emit
from .models import Artifact, ArtifactType, ArtifactVersion, ProjectEvent
from .problems import AppProblem
from .orchestrator import SceneRef, build_orchestrator
from .projects.router import project_or_404
from .schemas import Script, TeachingPlan

router = APIRouter(prefix="/projects/{project_id}", tags=["orchestrator"])


class OrchestratorMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


async def _approved_or_latest_payload(
    session: AsyncSession, project_id: str, artifact_type: ArtifactType
) -> dict | None:
    """The payload of an artifact's approved version, or its latest if none is
    approved yet — the same 'current cut' the workspace reads."""
    artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id, Artifact.artifact_type == artifact_type
        )
    )
    if artifact is None:
        return None
    version_id = artifact.approved_version_id or artifact.latest_version_id
    if version_id is None:
        return None
    version = await session.get(ArtifactVersion, version_id)
    return version.payload if version else None


async def _current_scenes(session: AsyncSession, project_id: str) -> list[SceneRef]:
    """Build the scene list the orchestrator reasons over from plan + script.

    The plan owns each beat's identity and order (the number the creator says);
    the script owns its narration. A beat with no id is not a scene — the same
    guard the workspace uses.
    """
    plan_payload = await _approved_or_latest_payload(
        session, project_id, ArtifactType.TEACHING_PLAN
    )
    if plan_payload is None:
        return []
    plan = TeachingPlan.model_validate(plan_payload)

    script_payload = await _approved_or_latest_payload(session, project_id, ArtifactType.SCRIPT)
    narration = {}
    if script_payload is not None:
        narration = {b.beat_id: b.narration for b in Script.model_validate(script_payload).beats}

    scenes: list[SceneRef] = []
    for beat in plan.beats:
        if not beat.id:
            continue
        scenes.append(
            SceneRef(
                beat_id=beat.id,
                index=len(scenes) + 1,
                title=beat.title or "",
                narration=narration.get(beat.id, ""),
                reason=beat.visual_opportunity or beat.objective or "",
            )
        )
    return scenes


class _ProjectObserver:
    """Serves the read-only observe tools on demand from the project's current
    artifacts (the approved version, or the latest). Only the tools that map to
    a real endpoint are served; the planned ones the orchestrator marks
    unavailable itself, so this never fabricates data the backend can't produce.
    """

    def __init__(
        self,
        session: AsyncSession,
        project_id: str,
        steps: asyncio.Queue | None = None,
    ):
        self.session = session
        self.project_id = project_id
        self.calls: list[str] = []  # what the orchestrator looked at, in order
        # When streaming, each observe call is announced here the moment it
        # starts so the room can print what it is doing live.
        self.steps = steps

    async def _payload(self, artifact_type: ArtifactType) -> dict | None:
        return await _approved_or_latest_payload(self.session, self.project_id, artifact_type)

    async def observe(self, name: str, args: dict[str, str]) -> str:
        self.calls.append(name)
        if self.steps is not None:
            self.steps.put_nowait({"name": name, "args": args})
        if name == "get_brief":
            return json.dumps(await self._payload(ArtifactType.PRODUCTION_BRIEF) or {})
        if name == "get_plan":
            return json.dumps(await self._payload(ArtifactType.TEACHING_PLAN) or {})
        if name == "get_script":
            return json.dumps(await self._payload(ArtifactType.SCRIPT) or {})
        if name == "get_project_state":
            return json.dumps(
                {
                    "brief": await self._payload(ArtifactType.PRODUCTION_BRIEF),
                    "plan": await self._payload(ArtifactType.TEACHING_PLAN),
                    "script": await self._payload(ArtifactType.SCRIPT),
                }
            )
        return json.dumps({"unavailable": name, "reason": "not available yet"})


@router.post("/orchestrator/turn")
async def orchestrator_turn(
    project_id: str,
    command: OrchestratorMessage,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream the room's turn as Server-Sent Events.

    The model's look-then-propose loop calls read-only observe tools; each one is
    announced as an `event: step` the moment it starts, so the chat prints what
    the room is doing instead of a bare wait. The turn ends with one `event: done`
    carrying the reply, an optional scoped proposal or question, and `observed`
    (the full trace, for the settled summary line). Still read-only — nothing
    mutates here; a proposal runs only on Apply, through its own tool endpoint.
    """
    await project_or_404(session, project_id)
    # Chat is one model call per turn; the durable chat.turn.started events are
    # already the per-project record of spend, so they are also the meter.
    day_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    turns_today = await session.scalar(
        select(func.count())
        .select_from(ProjectEvent)
        .where(
            ProjectEvent.project_id == project_id,
            ProjectEvent.type == "chat.turn.started",
            ProjectEvent.occurred_at >= day_start,
        )
    )
    if (turns_today or 0) >= get_settings().daily_project_chat_budget:
        raise AppProblem(
            429,
            "daily_chat_budget_exhausted",
            "The room has hit today’s conversation budget for this project. It resets "
            "at midnight — or raise DECODE_DAILY_PROJECT_CHAT_BUDGET if this is expected.",
            retryable=True,
        )
    scenes = await _current_scenes(session, project_id)
    steps: asyncio.Queue = asyncio.Queue()
    observer = _ProjectObserver(session, project_id, steps)

    async def run() -> None:
        # The turn is durable, not just streamed: the ask is committed before the
        # model runs (a dropped connection cannot lose it), and the reply +
        # observe trace are committed when it finishes. The project event feed
        # (GET /events, Last-Event-ID) replays them, so chat history survives a
        # reload instead of living only in this response stream.
        try:
            await emit(
                session, project_id, "chat.turn.started", data={"message": command.message}
            )
            await session.commit()
            turn = await build_orchestrator(get_settings()).turn(
                command.message, scenes, observer
            )
            payload = turn.model_dump() | {"observed": observer.calls}
            for name in observer.calls:
                await emit(session, project_id, "chat.observed", data={"tool": name})
            await emit(session, project_id, "chat.replied", data=payload)
            await session.commit()
            await steps.put({"done": payload})
        except Exception as exc:  # surface as a stream error, never a dead spinner
            await session.rollback()
            try:
                await emit(session, project_id, "chat.turn.failed", data={"error": str(exc)})
                await session.commit()
            except Exception:
                await session.rollback()
            await steps.put({"error": str(exc)})

    async def sse():
        task = asyncio.create_task(run())
        try:
            while True:
                item = await steps.get()
                if "done" in item:
                    yield f"event: done\ndata: {json.dumps(item['done'])}\n\n"
                    return
                if "error" in item:
                    yield f"event: error\ndata: {json.dumps({'error': item['error']})}\n\n"
                    return
                yield f"event: step\ndata: {json.dumps(item)}\n\n"
        finally:
            await task

    return StreamingResponse(sse(), media_type="text/event-stream")
