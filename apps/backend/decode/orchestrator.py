"""The orchestrator — the side chat's brain (AGENT-GRAPH §2).

A natural-language turn goes in; a scoped **proposal** or a plain **reply** comes
out. The orchestrator never mutates the project: proposing is the whole job. A
named tool runs only when the creator clicks *Apply*, through that tool's own
endpoint, and posts a receipt. This is the propose → apply → receipt invariant
turned into an agent surface — a request never silently changes anything.

The **tool registry** is the "everything the room can do, a hand can do" list:
every tool the orchestrator may propose maps to a real operation a direct control
also exposes. One tool today — `direct_scene`, the per-scene direction loop
(`regenerate_scene_visual`) — the registry grows as the workspace does.

Fake-first, like every Decode department: a deterministic `FakeOrchestrator`
drives the walking skeleton and the tests; an OpenAI orchestrator swaps in behind
the same contract without the surface changing.
"""

from __future__ import annotations

import re
from typing import Protocol

from pydantic import BaseModel, Field


class SceneRef(BaseModel):
    """The minimum the orchestrator needs to reason about a scene."""

    beat_id: str
    index: int = Field(ge=1)  # 1-based, the number the creator says ("scene 2")
    title: str = ""
    narration: str = ""


class ToolSpec(BaseModel):
    """A tool the orchestrator may propose. Names the real op a hand also runs."""

    name: str
    description: str
    args: list[str]  # argument names the proposal must fill


# The registry. Each entry is a capability the chat can propose *and* a control
# already exposes — never one without the other.
TOOLS: dict[str, ToolSpec] = {
    "direct_scene": ToolSpec(
        name="direct_scene",
        description=(
            "Redraw one scene's visual under the creator's direction. Only that "
            "scene changes; narration, timing and every other scene are untouched."
        ),
        args=["beat_id", "direction"],
    ),
}


class ProposedChange(BaseModel):
    """A scoped change the creator must confirm before anything moves."""

    tool: str
    args: dict
    summary: str  # "Redraw scene 2 to your direction"
    changes: str  # what moves — "Scene 2 · visual only"
    untouched: str  # what stays — "narration, timing, every other scene"
    receipt: str  # posted after Apply — "Scene 2 · visual redrawn"


class OrchestratorTurn(BaseModel):
    """What the room says, and optionally a proposal awaiting Apply.

    `reply` is always present — the room speaks every turn. `proposal` is present
    only when the request maps to a tool; nothing has changed yet either way.
    """

    reply: str
    proposal: ProposedChange | None = None


class Orchestrator(Protocol):
    async def turn(self, message: str, scenes: list[SceneRef]) -> OrchestratorTurn: ...


_SCENE_RE = re.compile(r"\bscene\s+(\d+)\b", re.IGNORECASE)


class FakeOrchestrator:
    """Deterministic walking-skeleton brain — no model call.

    Recognises exactly the one wired capability: "scene N, <direction>". When the
    message names a scene that exists and carries direction, it proposes
    `direct_scene`; otherwise it replies and asks which scene, so the creator is
    never left without a next step.
    """

    identifier = "orchestrator/fixture-v1"

    async def turn(self, message: str, scenes: list[SceneRef]) -> OrchestratorTurn:
        text = message.strip()
        by_index = {scene.index: scene for scene in scenes}
        match = _SCENE_RE.search(text)

        if match and text:
            index = int(match.group(1))
            scene = by_index.get(index)
            if scene is None:
                return OrchestratorTurn(
                    reply=(
                        f"There's no scene {index} — this cut has "
                        f"{len(scenes)} scene{'s' if len(scenes) != 1 else ''}. "
                        "Tell me which one and how it should look."
                    )
                )
            # Everything the creator wrote is the direction; the scene ref is the
            # target. Nothing runs until they Apply.
            direction = _SCENE_RE.sub("", text).strip(" ,.:—-") or text
            n = scene.index
            return OrchestratorTurn(
                reply=(
                    f"I scoped that to scene {n}. Review the boundary below — "
                    "nothing has changed yet."
                ),
                proposal=ProposedChange(
                    tool="direct_scene",
                    args={"beat_id": scene.beat_id, "direction": direction},
                    summary=f"Redraw scene {n} to your direction",
                    changes=f"Scene {n} · visual only",
                    untouched="Narration, timing, and every other scene",
                    receipt=f"Scene {n} · visual redrawn",
                ),
            )

        return OrchestratorTurn(
            reply=(
                "I can redraw a scene to your direction — name the scene and how it "
                'should look, e.g. "scene 2, make the fog thicker near the summit". '
                "I'll scope the change and you approve before anything moves."
            )
        )


def build_orchestrator() -> Orchestrator:
    # Only the fake exists today; the OpenAI orchestrator lands behind this seam.
    return FakeOrchestrator()
