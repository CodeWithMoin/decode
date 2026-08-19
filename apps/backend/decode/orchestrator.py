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

Fake-first, like every Decode agent: a deterministic `FakeOrchestrator`
drives the walking skeleton and the tests; a model-backed orchestrator swaps in
behind the same contract without the surface changing.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, Field

from .agents.skills import SkillSet
from .config import Settings


class Observer(Protocol):
    """Serves a read-only tool on demand — the orchestrator's eyes on the project.

    The real orchestrator calls these mid-turn to *look before it proposes*:
    pull the brief, the plan, the narration or the whole state only when the
    request needs it, instead of every turn carrying the whole project. Returns
    a JSON string (the tool's data, or an `{"unavailable": …}` marker). Lives
    here as a seam; the router supplies the implementation with DB access.
    """

    async def observe(self, name: str, args: dict[str, str]) -> str: ...


class SceneRef(BaseModel):
    """The minimum the orchestrator needs to reason about a scene."""

    beat_id: str
    index: int = Field(ge=1)  # 1-based, the number the creator says ("scene 2")
    title: str = ""
    narration: str = ""
    reason: str = ""


class ToolSpec(BaseModel):
    """A tool the orchestrator may propose. Names the real op a hand also runs.

    `target` is the executable form of "everything the room can do, a hand can
    do": it names the store action (`store:<action>`) or backend endpoint
    (`endpoint:<METHOD> <path>`) that actually performs the operation — or
    `planned` when no operation exists yet and the tool is future work.
    `read_only` marks observe tools, which return data and never propose a change.
    """

    name: str
    description: str
    args: list[str]  # argument names the proposal must fill
    target: str
    read_only: bool = False


# The registry — every capability the chat can propose, mapped to the real
# operation a direct control also exposes (AGENT-GRAPH §5). Never a tool without
# a hand, never a hand without a tool.
TOOLS: dict[str, ToolSpec] = {
    # --- Observe (read-only) ---
    "get_project_state": ToolSpec(
        name="get_project_state",
        description="Read the current project: brief, plan, scenes, selection and stale flags.",
        args=[],
        target="endpoint:GET /projects/{id}/studio",
        read_only=True,
    ),
    "get_timeline": ToolSpec(
        name="get_timeline",
        description=(
            "Read each clip's start, end, duration, track and z-order, plus gaps "
            "and overlaps."
        ),
        args=[],
        target="planned",
        read_only=True,
    ),
    "get_scene": ToolSpec(
        name="get_scene",
        description="Read one scene's spec, narration, controls, audio and stale flags.",
        args=["beat_id"],
        target="planned",
        read_only=True,
    ),
    "screenshot_scene": ToolSpec(
        name="screenshot_scene",
        description="Render a still of one scene at a progress point for visual inspection.",
        args=["beat_id", "at_progress"],
        target="planned",
        read_only=True,
    ),
    "check_alignment": ToolSpec(
        name="check_alignment",
        description="Report clip gaps, overlaps, narration-vs-visual drift and out-of-order beats.",
        args=[],
        target="planned",
        read_only=True,
    ),
    "get_script": ToolSpec(
        name="get_script",
        description="Read the narration.",
        args=[],
        target="endpoint:GET /artifacts/{id}/versions",
        read_only=True,
    ),
    "get_plan": ToolSpec(
        name="get_plan",
        description="Read the teaching plan and its beats.",
        args=[],
        target="endpoint:GET /artifacts/{id}/versions",
        read_only=True,
    ),
    "get_brief": ToolSpec(
        name="get_brief",
        description="Read the production brief.",
        args=[],
        target="endpoint:GET /production-brief",
        read_only=True,
    ),
    # --- Plan (Director) — resets plan + script ---
    "reorder_beats": ToolSpec(
        name="reorder_beats",
        description="Move a beat earlier or later in the teaching order.",
        args=["beat_id", "to_index"],
        target="store:reorder",
    ),
    "cut_beat": ToolSpec(
        name="cut_beat",
        description="Remove a beat from the plan.",
        args=["beat_id"],
        target="store:removeScene",
    ),
    "add_beat": ToolSpec(
        name="add_beat",
        description="Add a new beat at a position in the plan.",
        args=["after_index"],
        target="store:addScene",
    ),
    "retime_beat": ToolSpec(
        name="retime_beat",
        description="Change a beat's target duration.",
        args=["beat_id", "delta_seconds"],
        target="store:nudgeDur",
    ),
    # --- Script (Writer) — marks voice stale ---
    "rewrite_narration": ToolSpec(
        name="rewrite_narration",
        description="Rewrite one beat's narration under the creator's direction.",
        args=["beat_id", "direction"],
        target="endpoint:POST /artifacts/{id}/versions",
    ),
    # --- Visual (Storyboard + Renderer) — scene-scoped, marks that scene stale ---
    "direct_scene": ToolSpec(
        name="direct_scene",
        description=(
            "Redraw one scene's visual under the creator's direction. Only that "
            "scene changes; narration, timing and every other scene are untouched."
        ),
        args=["beat_id", "direction"],
        target="endpoint:POST /scene-visuals/regenerations",
    ),
    "regenerate_visual": ToolSpec(
        name="regenerate_visual",
        description="Regenerate one scene's visual without new direction.",
        args=["beat_id"],
        target="endpoint:POST /scene-visuals/regenerations",
    ),
    "set_control": ToolSpec(
        name="set_control",
        description="Set one declared control value on a scene.",
        args=["beat_id", "name", "value"],
        target="store:setControlValue",
    ),
    # --- Voice ---
    "record_narration": ToolSpec(
        name="record_narration",
        description="Record one beat's narration (or all) to audio.",
        args=["beat_id"],
        target="endpoint:POST /voice/generations",
    ),
    # --- Edit (Editor) — scene ops, reset nothing ---
    "split_scene": ToolSpec(
        name="split_scene",
        description="Split a scene into two at its midpoint.",
        args=["beat_id"],
        target="store:splitScene",
    ),
    "merge_scenes": ToolSpec(
        name="merge_scenes",
        description="Merge a scene into the next one.",
        args=["beat_id"],
        target="store:mergeScene",
    ),
    "duplicate_scene": ToolSpec(
        name="duplicate_scene",
        description="Duplicate a scene beside the original.",
        args=["beat_id"],
        target="store:dupScene",
    ),
    "delete_scene": ToolSpec(
        name="delete_scene",
        description="Remove a scene from the cut.",
        args=["beat_id"],
        target="store:removeScene",
    ),
    "retime_scene": ToolSpec(
        name="retime_scene",
        description="Change a scene's duration.",
        args=["beat_id", "delta_seconds"],
        target="store:nudgeDur",
    ),
    "set_fade": ToolSpec(
        name="set_fade",
        description="Set a scene's fade in or out.",
        args=["beat_id", "edge", "seconds"],
        target="store:setClipFade",
    ),
    "set_track": ToolSpec(
        name="set_track",
        description="Move a scene to another video track.",
        args=["beat_id", "track"],
        target="planned",
    ),
    "set_z_order": ToolSpec(
        name="set_z_order",
        description="Change a scene's stacking order.",
        args=["beat_id", "z"],
        target="planned",
    ),
    "set_start": ToolSpec(
        name="set_start",
        description="Set a scene's explicit timeline start.",
        args=["beat_id", "start"],
        target="planned",
    ),
    # --- First build (whole production) ---
    "start_build": ToolSpec(
        name="start_build",
        description=(
            "Create the whole video from the creator's question or topic. Only for a "
            "project with no video yet. topic is their question in their words; "
            "audience is who it's for in plain words; depth is one of "
            "intuition_first | balanced | rigorous; target_duration_seconds is one "
            "of 60 | 180 | 300 | 600."
        ),
        args=["topic", "audience", "depth", "target_duration_seconds"],
        target="endpoint:POST /production-brief/generations",
    ),
    # --- Publish (Editor) ---
    "render_export": ToolSpec(
        name="render_export",
        description="Render the cut to a downloadable video.",
        args=["format"],
        target="endpoint:POST /projects/{id}/renders",
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


class ClarifyOption(BaseModel):
    """One pickable answer to a clarifying question. `label` is the complete
    instruction sent back as the next turn — choosing it is the same as typing
    it — so each option must, on its own, resolve the ambiguity that was asked."""

    label: str
    detail: str = ""


class Clarification(BaseModel):
    """A scoped question the room asks *only* when the request is genuinely
    ambiguous — no clear target, or unclear what to change. It offers options to
    pick rather than a dead-end 'which one?', so the creator answers in one tap.
    A clear request never produces one; it goes straight to a proposal."""

    prompt: str
    options: list[ClarifyOption]


class OrchestratorTurn(BaseModel):
    """What the room says, and at most one of a proposal or a question.

    `reply` is always present — the room speaks every turn. `proposal` is present
    only when the request maps cleanly to a tool. `question` is present instead
    when the request is too ambiguous to scope. Never both; nothing has changed.
    """

    reply: str
    proposal: ProposedChange | None = None
    question: Clarification | None = None


class Orchestrator(Protocol):
    async def turn(
        self,
        message: str,
        scenes: list[SceneRef],
        observer: Observer | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> OrchestratorTurn: ...


_SCENE_RE = re.compile(r"\bscene\s+(\d+)\b", re.IGNORECASE)


class FakeOrchestrator:
    """Deterministic walking-skeleton brain — no model call.

    Recognises the wired Edit verbs — split, merge, duplicate, delete, fade,
    retime — and falls back to free-form `direct_scene` direction. Anything else
    replies asking which scene and what to do, so the creator is never left
    without a next step. Args are serialised as strings so the frontend's
    `Record<string, string>` proposal args never meet a bare number.
    """

    identifier = "orchestrator/fixture-v1"

    @staticmethod
    def _seconds(text: str, default: float) -> float:
        """A duration the creator stated, or the default. Only matches a number
        followed by a seconds unit — never the bare scene number itself."""
        explicit = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:s|sec(?:ond)?s?)\b", text, re.IGNORECASE)
        return float(explicit.group(1)) if explicit else default

    def _propose(
        self,
        n: int,
        tool: str,
        args: dict,
        summary: str,
        changes: str,
        receipt: str,
    ) -> OrchestratorTurn:
        return OrchestratorTurn(
            reply=(
                f"I scoped that to scene {n}. Review the boundary below — "
                "nothing has changed yet."
            ),
            proposal=ProposedChange(
                tool=tool,
                args=args,
                summary=summary,
                changes=changes,
                untouched="Every other scene, and the narration and timing",
                receipt=receipt,
            ),
        )

    @staticmethod
    def _pick_a_scene(scenes: list[SceneRef]) -> Clarification | None:
        """A pickable list of the scenes, so 'which one?' is one tap, not typing.
        None when there are no scenes yet — then there is nothing to offer."""
        if not scenes:
            return None
        return Clarification(
            prompt="Which scene?",
            options=[
                ClarifyOption(
                    label=f"Scene {scene.index}",
                    detail=scene.title or scene.narration[:48],
                )
                for scene in scenes[:4]
            ],
        )

    async def turn(
        self,
        message: str,
        scenes: list[SceneRef],
        observer: Observer | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> OrchestratorTurn:
        # The fake reasons from the scene list alone; it never needs to look
        # anything up, so the observer and history are accepted (one contract)
        # and ignored.
        text = message.strip()
        by_index = {scene.index: scene for scene in scenes}
        match = _SCENE_RE.search(text)

        if not (match and text):
            return OrchestratorTurn(
                reply=(
                    "I can redraw a scene, split, merge, duplicate, delete, fade or "
                    "retime one — name the scene and what to do, e.g. \"split scene 2\" "
                    'or "scene 2, make the fog thicker near the summit". '
                    "I'll scope the change and you approve before anything moves."
                ),
                question=self._pick_a_scene(scenes),
            )

        index = int(match.group(1))
        scene = by_index.get(index)
        if scene is None:
            return OrchestratorTurn(
                reply=(
                    f"There's no scene {index} — this cut has "
                    f"{len(scenes)} scene{'s' if len(scenes) != 1 else ''}. "
                    "Tell me which one and what to do."
                ),
                question=self._pick_a_scene(scenes),
            )

        n = scene.index
        lower = text.lower()

        if "split" in lower:
            return self._propose(
                n, "split_scene", {"beat_id": scene.beat_id},
                f"Split scene {n} into two", f"Scene {n} · split at midpoint",
                f"Scene {n} · split",
            )
        if "merge" in lower:
            return self._propose(
                n, "merge_scenes", {"beat_id": scene.beat_id},
                f"Merge scene {n} into the next", f"Scene {n} · merged with {n + 1}",
                f"Scene {n} · merged",
            )
        if "duplicate" in lower or "copy" in lower:
            return self._propose(
                n, "duplicate_scene", {"beat_id": scene.beat_id},
                f"Duplicate scene {n}", f"Scene {n} · duplicated",
                f"Scene {n} · duplicated",
            )
        if "delete" in lower or "remove" in lower:
            return self._propose(
                n, "delete_scene", {"beat_id": scene.beat_id},
                f"Delete scene {n}", f"Scene {n} · removed",
                f"Scene {n} · removed",
            )
        if "fade" in lower:
            edge = "out" if "out" in lower else "in"
            seconds = self._seconds(text, 1.0)
            return self._propose(
                n, "set_fade",
                {"beat_id": scene.beat_id, "edge": edge, "seconds": f"{seconds:g}"},
                f"Fade scene {n} {edge} {seconds:g}s", f"Scene {n} · fade {edge}",
                f"Scene {n} · fade {edge}",
            )
        if any(word in lower for word in ("shorten", "lengthen", "retime", "trim")):
            delta = self._seconds(text, 5.0)
            if "lengthen" in lower:
                delta = abs(delta)
            elif "shorten" in lower:
                delta = -abs(delta)
            return self._propose(
                n, "retime_scene",
                {"beat_id": scene.beat_id, "delta_seconds": f"{delta:g}"},
                f"Retime scene {n} by {delta:g}s", f"Scene {n} · duration",
                f"Scene {n} · retimed",
            )

        # Questions are read-only turns, not visual directions. The fixture used
        # to route every unrecognised sentence through `direct_scene`, so asking
        # "Why does scene 1 use this visual?" offered to redraw it. Answer from
        # the durable teaching intent we already loaded instead.
        asks = lower.endswith("?") or lower.startswith(("why ", "what ", "how ", "explain "))
        if asks:
            reason = scene.reason or scene.title or "the teaching point in this beat"
            return OrchestratorTurn(
                reply=(
                    f"I used this scene to {reason.rstrip('.').lower()}. "
                    "I kept the visual scoped to that one teaching job so the narration carries the detail."
                )
            )

        # Fallback: free-form direction -> direct_scene. Everything the creator
        # wrote is the direction; the scene ref is the target. Nothing runs until
        # they Apply.
        direction = re.sub(r"\s+", " ", _SCENE_RE.sub("", text)).strip(" ,.:—-") or text
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


class _LLMProposal(BaseModel):
    """The proposal shape the model emits. `args` is a JSON object encoded as a
    string because OpenAI strict structured outputs forbid an open-ended dict
    (every object must set `additionalProperties: false`). We decode it back into
    `ProposedChange.args` — the wire/frontend contract stays a `dict[str, str]`."""

    tool: str
    args_json: str
    summary: str
    changes: str
    untouched: str
    receipt: str


class _LLMClarifyOption(BaseModel):
    label: str
    detail: str


class _LLMClarification(BaseModel):
    prompt: str
    options: list[_LLMClarifyOption]


class _LLMTurn(BaseModel):
    reply: str
    proposal: _LLMProposal | None = None
    question: _LLMClarification | None = None


class ModelOrchestrator:
    """The real side-chat brain — an LLM reads the message and the scenes against
    the tool registry and returns a reply and, when the request maps to a tool, a
    scoped proposal.

    The output is validated against `TOOLS` before it leaves: an unknown tool or
    a read-only tool degrades to a plain reply (never run an unregistered tool),
    and args are coerced to strings and trimmed to the tool's declared names so
    the frontend's `Record<string, string>` args never meet a bare number or an
    extra key.
    """

    identifier = "orchestrator/openai-v1"

    def __init__(self, settings: Settings):
        if not settings.openai_api_key:
            raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_ORCHESTRATOR=openai")
        from openai import AsyncOpenAI

        self.model = settings.orchestrator_model
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key, base_url=settings.openai_base_url
        )

    def _system_prompt(self) -> str:
        # Prose lives in agents/orchestrator/SKILL.md like every other prompt;
        # only the live tool registry is injected here.
        tools = [
            {"name": tool.name, "description": tool.description, "args": tool.args}
            for tool in TOOLS.values()
            if not tool.read_only
        ]
        prose = SkillSet(Path(__file__).parent / "agents" / "orchestrator").system()
        return prose.replace("{{TOOLS_JSON}}", json.dumps(tools, indent=2))

    # How many observe rounds before the model must answer. Observing is cheap
    # and the read tools are few; a runaway that never proposes stops here.
    MAX_OBSERVE_STEPS = 4

    def _observe_tools(self) -> list[Any]:
        """The read-only tools, as OpenAI function tools the model can call."""
        return [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": {
                    "type": "object",
                    "properties": {arg: {"type": "string"} for arg in tool.args},
                    "required": tool.args,
                    "additionalProperties": False,
                },
            }
            for tool in TOOLS.values()
            if tool.read_only
        ]

    @staticmethod
    async def _run_observe(name: str, arguments: str, observer: Observer | None) -> str:
        """Serve one observe call. Never runs a writable tool, never fabricates:
        an unknown/writable name, an absent observer, or a not-yet-built tool all
        return a marker the model reads rather than silent or invented data."""
        spec = TOOLS.get(name)
        if spec is None or not spec.read_only:
            return json.dumps({"error": f"{name} is not a readable tool"})
        if observer is None or spec.target == "planned":
            return json.dumps({"unavailable": name, "reason": "not available yet"})
        try:
            args = json.loads(arguments) if arguments else {}
        except json.JSONDecodeError:
            args = {}
        return await observer.observe(name, {k: str(v) for k, v in args.items()})

    async def turn(
        self,
        message: str,
        scenes: list[SceneRef],
        observer: Observer | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> OrchestratorTurn:
        tools = self._observe_tools()
        # The recent conversation, as real turns — without it every message is
        # a stranger and the model cannot carry an ask across two replies
        # ("who's it for?" → "beginners") or notice it already asked.
        # Responses API input typing: assistant turns carry output_text,
        # user turns carry input_text — mixing them is a 400.
        input_items: list = [
            {
                "role": "assistant" if item.get("who") == "decode" else "user",
                "content": [
                    {
                        "type": "output_text" if item.get("who") == "decode" else "input_text",
                        "text": item.get("text", "")[:2000],
                    }
                ],
            }
            for item in (history or [])[-12:]
            if item.get("text")
        ]
        input_items.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "message": message,
                                "scenes": [
                                    {
                                        "beat_id": scene.beat_id,
                                        "index": scene.index,
                                        "title": scene.title,
                                        "narration": scene.narration,
                                    }
                                    for scene in scenes
                                ],
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            }
        )

        # Look-then-propose: the model may call observe tools to inspect the
        # project, we run each and feed the result back, and it loops until it
        # stops asking and returns a reply (with, at most, one proposal).
        for _ in range(self.MAX_OBSERVE_STEPS):
            response = await self.client.responses.parse(
                model=self.model,
                instructions=self._system_prompt(),
                input=input_items,
                tools=tools,
                text_format=_LLMTurn,
            )
            calls: list = [
                item
                for item in response.output
                if getattr(item, "type", None) == "function_call"
            ]
            if not calls:
                if response.output_parsed is None:
                    raise RuntimeError("orchestrator returned no parsed turn")
                return self._validate(self._to_turn(response.output_parsed))
            input_items.extend(response.output)
            for call in calls:
                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": await self._run_observe(call.name, call.arguments, observer),
                    }
                )

        raise RuntimeError("orchestrator kept observing without answering")

    @staticmethod
    def _to_turn(llm: _LLMTurn) -> OrchestratorTurn:
        """Decode the model's args_json string back into the dict the wire uses.
        A malformed or non-object args_json degrades to empty args — `_validate`
        then fills the tool's declared names with blanks rather than crashing."""
        question = (
            Clarification(
                prompt=llm.question.prompt,
                options=[
                    ClarifyOption(label=opt.label, detail=opt.detail)
                    for opt in llm.question.options
                ],
            )
            if llm.question is not None
            else None
        )
        if llm.proposal is None:
            return OrchestratorTurn(reply=llm.reply, proposal=None, question=question)
        try:
            args = json.loads(llm.proposal.args_json or "{}")
        except json.JSONDecodeError:
            args = {}
        if not isinstance(args, dict):
            args = {}
        return OrchestratorTurn(
            reply=llm.reply,
            proposal=ProposedChange(
                tool=llm.proposal.tool,
                args={str(k): str(v) for k, v in args.items()},
                summary=llm.proposal.summary,
                changes=llm.proposal.changes,
                untouched=llm.proposal.untouched,
                receipt=llm.proposal.receipt,
            ),
            question=question,
        )

    @staticmethod
    def _validate(turn: OrchestratorTurn) -> OrchestratorTurn:
        if turn.proposal is None:
            return turn
        proposal = turn.proposal
        spec = TOOLS.get(proposal.tool)
        if spec is None or spec.read_only:
            # Not a runnable tool — keep the reply and any question, drop the
            # would-be proposal rather than offering a button that does nothing.
            return OrchestratorTurn(reply=turn.reply, proposal=None, question=turn.question)
        proposal.args = {name: str(proposal.args.get(name, "")) for name in spec.args}
        # A proposal and a question are mutually exclusive; a scoped change wins.
        turn.question = None
        return turn


def build_orchestrator(settings: Settings) -> Orchestrator:
    if settings.orchestrator == "auto":
        return ModelOrchestrator(settings) if settings.openai_api_key else FakeOrchestrator()
    if settings.orchestrator == "fake":
        return FakeOrchestrator()
    if settings.orchestrator == "openai":
        return ModelOrchestrator(settings)
    raise ValueError(f"unknown orchestrator provider: {settings.orchestrator!r}")
