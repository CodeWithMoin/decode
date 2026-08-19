from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .timing import Anchor, NarrationTiming, Word


class Brand(BaseModel):
    colors: list[str] = Field(default_factory=list)
    fonts: str | None = None
    guidelines: str | None = None


class ProductionIntent(BaseModel):
    creative_brief: str | None = None
    audience: str = Field(min_length=1, max_length=500)
    target_duration_seconds: Literal[60, 180, 300, 600] | None = None
    runtime_mode: Literal["fixed", "deep_dive"]
    depth: Literal["intuition_first", "balanced", "rigorous"]
    narration_style: Literal["professional", "friendly", "storyteller"]
    # No department reads this yet. It stays because ProductionIntent is a stored
    # artifact payload, not just a request body: dropping a field would leave
    # existing schema_version 1 versions carrying it and new ones not, which is
    # the drift the version number is supposed to rule out. Removing it is a
    # schema_version bump, not a cleanup.
    brand: Brand = Field(default_factory=Brand)
    # The project's palette — roles the Motion Designer paints every scene with
    # (surface, border, ink, support, accent). Optional: when unset, the system
    # picks a default deterministically from the plan, so all of a project's
    # scenes still share one palette. Creator- or orchestrator-set values win.
    palette: dict[str, str] | None = None

    @model_validator(mode="after")
    def duration_matches_mode(self):
        if self.runtime_mode == "fixed" and self.target_duration_seconds is None:
            raise ValueError("target_duration_seconds is required for fixed runtime")
        if self.runtime_mode == "deep_dive" and self.target_duration_seconds is not None:
            raise ValueError("target_duration_seconds must be null for deep_dive")
        return self


class KeyConcept(BaseModel):
    name: str = Field(min_length=1)
    importance: Literal["core", "supporting"]


class ProductionBrief(BaseModel):
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    audience_profile: str = Field(min_length=1)
    learning_objectives: list[str]
    key_concepts: list[KeyConcept]
    prerequisites: list[str]
    scope_in: list[str]
    scope_out: list[str]
    source_findings: dict
    open_questions: list[str]


class PlanSection(BaseModel):
    """One named movement in the Director's chosen teaching structure."""

    id: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(min_length=1, max_length=120)
    purpose: str = Field(min_length=1, max_length=400)


class BriefSupport(BaseModel):
    """Pointers into the approved brief, kept internal by default."""

    learning_objectives: list[int] = Field(default_factory=list, max_length=6)
    key_concepts: list[str] = Field(default_factory=list, max_length=8)
    scope_in: list[int] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def has_support(self):
        if not (self.learning_objectives or self.key_concepts or self.scope_in):
            raise ValueError("at least one approved brief support reference is required")
        return self


class Beat(BaseModel):
    """One teaching step. Structure and budget only — never narration.

    `target_duration_seconds` is the Director's budget, not a measurement. Real
    runtime comes from generated audio later, and the two are allowed to differ.
    """

    id: str = Field(min_length=1, max_length=40, pattern=r"^beat-[a-z0-9-]+$")
    title: str = Field(min_length=1, max_length=120)
    # What a viewer can do afterwards, which is what the studio renders as
    # "Viewer learns —". Not a summary of the beat's content.
    objective: str = Field(min_length=1, max_length=400)
    target_duration_seconds: int = Field(ge=5, le=600)
    section_id: str = Field(min_length=1, max_length=40)
    key_points: list[str] = Field(min_length=1, max_length=5)
    depends_on: list[str] = Field(default_factory=list, max_length=5)
    brief_support: BriefSupport
    example: str | None = Field(default=None, max_length=600)
    visual_opportunity: str | None = Field(default=None, max_length=600)


class PlanPalette(BaseModel):
    """The project's five color roles, chosen by the Director to fit the
    topic's mood. One palette per project stays the invariant — the choice is
    the model's, made once at plan time, never per scene."""

    surface: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    border: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    ink: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    support: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class TeachingPlan(BaseModel):
    """The Director's shape for the video: what is taught, in what order.

    No total runtime field. `total = Σ beats`, and storing it would be a second
    number free to disagree with the first.

    The Director chooses a named structure appropriate to the material. Sections
    are decisions, not a fixed three-act template or an arithmetic split.
    """

    # Chosen by the Director at plan time; None on plans predating the field,
    # where the deterministic pick remains the fallback.
    palette: PlanPalette | None = None
    structure_name: str = Field(min_length=1, max_length=120)
    sections: list[PlanSection] = Field(min_length=1, max_length=8)
    through_line: str = Field(min_length=1, max_length=500)
    rationale: str = Field(min_length=1, max_length=1200)
    beats: list[Beat] = Field(min_length=1)
    plan_findings: dict = Field(default_factory=dict)


class BeatNarration(BaseModel):
    """The words for one beat, and the only editable copy of them.

    No word count and no duration. Both are derived — words from the narration
    itself, runtime from the plan's budget — and storing either would be a
    second number free to disagree with the first.
    """

    beat_id: str = Field(min_length=1)
    narration: str = Field(min_length=1)
    # The narration split into ordered semantic moments — idea-units, not
    # sentences by length. Each is one thing the beat's visual should stage, in
    # spoken order, so the animation reveals a moment as its words are said rather
    # than all at once (ADR-005, sub-scene timing). Empty on legacy scripts; the
    # visual then treats the whole narration as a single moment.
    segments: list[str] = Field(default_factory=list)


class Script(BaseModel):
    """The Writer's narration, one entry per beat of the approved plan.

    One artifact for the whole video rather than one per beat: narration is
    editable in exactly one place, lineage stays one parent to one child, and a
    creator approves a script once instead of N times. Which beats an edit made
    stale is payload, not a row in the artifact table.
    """

    rationale: str = Field(min_length=1, max_length=1200)
    beats: list[BeatNarration] = Field(min_length=1)
    script_findings: dict = Field(default_factory=dict)


class SceneControl(BaseModel):
    """One knob the creator may turn on a scene.

    Decode serialises these into the module's `CONTROLS` export itself rather
    than letting the model write that block. Two reasons: the settings panel
    reads declared JSON and never executes a module to discover its knobs, and
    a manifest generated from this list cannot drift from the list the panel
    renders.
    """

    name: str = Field(min_length=1, max_length=40, pattern=r"^[a-z][A-Za-z0-9]*$")
    type: Literal["string", "number", "color", "boolean"]
    label: str = Field(min_length=1, max_length=60)
    default: str | float | bool
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None


class VisualBeat(BaseModel):
    """One animated moment inside a scene, declared *when* by an anchor, never a
    hardcoded second (VISUALIZER-TO-HYPERFRAMES §2). The name matches the beat's
    id in the HyperFrames composition; Decode resolves the anchor to a start time
    against the narration and hands the composition `{beat, start, duration}`.

    `duration_s` is the beat's own animation length (how long the move takes) —
    an authoring choice, distinct from the scene's duration, which comes from the
    narration. The Visualizer never writes the scene length or the start second.
    """

    name: str = Field(min_length=1, max_length=60)
    anchor: Anchor
    duration_s: float = Field(default=0.6, gt=0, le=30)


class SceneModule(BaseModel):
    """The animation for one beat.

    No declared duration. The plan owns runtime and `total = Σ dur`; a React scene
    may read the enclosing Sequence's frame clock so motion scales to 24, 30 or 60
    fps, but it cannot register or replace that duration.

    Two render substrates during the migration (VISUALIZER-TO-HYPERFRAMES): the
    legacy `component_source` (React against `@decode/animation-api`, played by
    Remotion) and `composition_html` (a HyperFrames composition + anchored
    `beats`). A module carries at least one during the migration window.
    """

    beat_id: str = Field(min_length=1)
    controls: list[SceneControl] = Field(max_length=20)
    component_source: str | None = Field(default=None, min_length=1)
    composition_html: str | None = Field(default=None, min_length=1)
    beats: list[VisualBeat] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def _has_a_renderable(self) -> "SceneModule":
        if not self.component_source and not self.composition_html:
            raise ValueError("a scene needs component_source or composition_html")
        return self


class SceneVisuals(BaseModel):
    rationale: str = Field(min_length=1, max_length=1200)
    scenes: list[SceneModule] = Field(min_length=1)
    visual_findings: dict = Field(default_factory=dict)


class VoiceNarration(BaseModel):
    """Spoken audio for one beat, referenced by object key.

    `words` carries per-word timings when the provider (or a forced-alignment
    pass) supplies them; it is empty when no alignment was performed. It is what
    turns this clip into a `NarrationTiming` — the authority sub-scene beats
    resolve against (see `timing.py`). Absent words means phrase anchors in that
    scene cannot resolve yet, which the resolver surfaces rather than guessing.
    """

    beat_id: str = Field(min_length=1)
    audio_key: str = Field(min_length=1)
    duration_seconds: float = Field(gt=0)
    words: list[Word] = Field(default_factory=list)

    def narration_timing(self) -> NarrationTiming:
        """This clip as the timing authority for its scene's beats."""
        return NarrationTiming(duration=self.duration_seconds, words=self.words)


class Voice(BaseModel):
    """The narration read aloud, one clip per beat."""

    rationale: str = Field(min_length=1, max_length=1200)
    clips: list[VoiceNarration] = Field(min_length=1)
    voice_findings: dict = Field(default_factory=dict)


class CreateProject(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    # False means "stop after each stage so I can read it first".
    auto_continue: bool = True


class UpdateProject(BaseModel):
    auto_continue: bool


class GenerateBrief(BaseModel):
    source_version_ids: list[str] = Field(min_length=1)
    intent_version_id: str


class GenerateTeachingPlan(BaseModel):
    brief_version_id: str
    intent_version_id: str


class GenerateScript(BaseModel):
    plan_version_id: str
    intent_version_id: str


class GenerateSceneVisuals(BaseModel):
    script_version_id: str
    intent_version_id: str


class GenerateVoice(BaseModel):
    script_version_id: str
    intent_version_id: str


class RegenerateSceneVisual(BaseModel):
    """Redraw one scene under a creator's direction.

    The version id is the scenes the creator is looking at: if a newer set has
    been published since, the direction was written against a stale cut and the
    route refuses rather than silently regenerating the wrong scene. The script,
    plan and intent the regeneration reads are resolved from that version's own
    lineage, so the creator never re-picks inputs the scenes already carry.
    """

    scene_visuals_version_id: str
    beat_id: str
    direction: str = Field(min_length=1, max_length=2000)


class AcceptSceneCandidate(BaseModel):
    """The exact candidate source the creator previewed and chose to apply."""

    component_source: str = Field(min_length=1, max_length=200_000)


class EditArtifact(BaseModel):
    """A creator's complete replacement of one artifact version.

    `payload` stays untyped here and is validated against the artifact's own
    schema in the handler. The artifact type is already known from the database,
    so it is the discriminator — a union on this field would ask Pydantic to
    guess which shape was meant and give a worse error when it guessed wrong.
    """

    base_version_id: str
    schema_version: Literal[1] = 1
    payload: dict


class ApproveVersion(BaseModel):
    decision: Literal["approved"]
    note: str | None = Field(default=None, max_length=2000)


class RetryRun(BaseModel):
    expected_failed_run_id: str


class CancelRun(BaseModel):
    expected_active_run_id: str
