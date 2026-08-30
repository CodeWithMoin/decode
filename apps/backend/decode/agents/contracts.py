"""What a department is, from the outside.

A department is an application-level execution policy, not a network service and
not a vendor adapter: it owns one craft and produces one artifact. These
protocols are the only thing the worker knows about it, which is the seam that
lets a deterministic fixture and a real model department be swapped without
touching routes, artifact schemas, lineage, or job semantics.

`SourceInput` is what the contract declares a department may see: the source
metadata plus a way to read the bytes. Nothing else about the project crosses
this boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..schemas import (
    FilmRhythmBeat,
    ProductionBrief,
    ProductionIntent,
    ProjectVisualBible,
    SceneHandoff,
    SceneModule,
    SceneStoryboard,
    SceneVisuals,
    Script,
    TeachingPlan,
    VisualDirection,
    Voice,
)


@dataclass(frozen=True)
class SourceInput:
    object_key: str
    filename: str
    media_type: str
    size_bytes: int
    sha256: str

    @classmethod
    def from_manifest(cls, manifest: dict) -> SourceInput:
        return cls(
            object_key=manifest["object_key"],
            filename=manifest.get("filename", ""),
            media_type=manifest.get("media_type", "application/octet-stream"),
            size_bytes=manifest.get("size_bytes", 0),
            sha256=manifest.get("sha256", ""),
        )


@dataclass(frozen=True)
class ProviderUsage:
    model: str
    input_tokens: int
    output_tokens: int
    turns: int
    # The provider's own dollar figure for the call (OpenRouter reports one).
    # None means "not reported", and pricing falls back to the local rate
    # table; when present it wins — it's exact where the table is an estimate.
    cost_usd: float | None = None


class Department(Protocol):
    """What every department has, whatever it consumes or produces.

    The routing layer holds departments through this, because it needs their
    identity for provenance and metering without caring which craft they own.
    """

    identifier: str


class Intake(Protocol):
    """Turns sources plus production intent into a Production Brief."""

    identifier: str

    async def generate(
        self, intent: ProductionIntent, sources: list[SourceInput]
    ) -> ProductionBrief: ...


class Architect(Protocol):
    """Turns an approved Production Brief into a Teaching Plan.

    A separate protocol rather than a generic one: departments consume genuinely
    different things — Intake reads bytes, the Architect reads an artifact
    another department already published — and a shared `generate(inputs: Any)`
    would hide that behind a cast at every call site. A third department is when
    a common shape is worth extracting, if it exists at all.
    """

    identifier: str

    async def generate(self, intent: ProductionIntent, brief: ProductionBrief) -> TeachingPlan: ...


class Author(Protocol):
    """Turns an approved Teaching Plan into the Script.

    The third department, and the shape the note above predicted: intent plus
    one upstream artifact, out one artifact. It is still not extracted into a
    generic protocol, because the only way to write one is with a type variable
    per artifact, and `Department[TeachingPlan, Script]` reads worse at every
    call site than the two lines it saves. Extract it when a department appears
    that the routing layer genuinely cannot name.
    """

    identifier: str

    async def generate(self, intent: ProductionIntent, plan: TeachingPlan) -> Script: ...


@dataclass(frozen=True)
class FocusedVisualDirection:
    """Only the direction one scene renderer is allowed to see."""

    bible: ProjectVisualBible
    rhythm: FilmRhythmBeat
    storyboard: SceneStoryboard
    incoming_handoff: SceneHandoff | None
    outgoing_handoff: SceneHandoff | None


class VisualDirector(Protocol):
    """Turns approved teaching and narration into pre-render visual direction."""

    identifier: str
    last_usage: ProviderUsage | None

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> VisualDirection: ...


class Visualizer(Protocol):
    """Turns an approved Script into the animation for each beat.

    The first department that reads two upstream artifacts: the plan for what a
    beat teaches, the script for what is being said over it. That is why the
    generic protocol still is not worth extracting.
    """

    identifier: str

    async def generate(
        self,
        intent: ProductionIntent,
        plan: TeachingPlan,
        script: Script,
        *,
        focused_direction: FocusedVisualDirection | None = None,
    ) -> SceneVisuals: ...

    async def regenerate_one(
        self,
        intent: ProductionIntent,
        plan: TeachingPlan,
        script: Script,
        prior_scenes: list[SceneModule],
        beat_id: str,
        direction: str,
        *,
        focused_direction: FocusedVisualDirection | None = None,
    ) -> SceneVisuals: ...


class Narrator(Protocol):
    """Turns an approved Script into the narration read aloud, one clip per beat."""

    identifier: str
    last_usage: ProviderUsage | None

    async def generate(self, intent: ProductionIntent, script: Script) -> Voice: ...


class Evaluator(Protocol):
    """Records structured checks. It never revises and never gates approval."""

    identifier: str
    last_usage: ProviderUsage | None

    async def evaluate_brief(
        self, intent: ProductionIntent, brief: ProductionBrief
    ) -> tuple[str, list[dict], str]: ...

    async def evaluate_plan(
        self, intent: ProductionIntent, brief: ProductionBrief, plan: TeachingPlan
    ) -> tuple[str, list[dict], str]: ...
