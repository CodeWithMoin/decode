"""The Visualizer department — the Motion Designer's scene visuals.

It reads an approved Script and its plan and writes the animation for each beat as
a **Remotion f(frame) module** — a React component imported from `@decode/animation-api`,
every moving value driven by `useCurrentFrame()`/`interpolate()` — plus the controls
a creator may turn on it. (Legacy scenes may still carry a HyperFrames
`composition_html`; `validation.py` checks each by its substrate during the window
those exist.)

Code rather than a JSON visual spec, because a spec can only express what its schema
anticipated and scene visuals are the place that ceiling binds hardest. The cost is
that output has to be validated before it is published — which `validation.py` does
statically — and that a module is only ever executed in a browser preview or a
sandboxed export renderer, never in this process.

The `CONTROLS` manifest is generated here from declared structured data rather than
written by the model, so the settings panel reads JSON instead of executing a module
to discover its knobs.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from ...config import Settings
from ...schemas import (
    ChoreographyVerb,
    ProductionIntent,
    SceneControl,
    SceneModule,
    SceneVisuals,
    Script,
    TeachingPlan,
)
from .. import tracing
from ..agent_config import AgentConfig
from ..agent_runtime import AgentRuntime
from ..contracts import ProviderUsage
from .prompt import CHOREOGRAPHY_SYSTEM, REPAIR_PROMPT, SKILLS, build_instructions
from .validation import RUNTIME_VERSION, repair_message, validate_scenes


class SceneDraft(BaseModel):
    """One scene the model authors — React f(frame) only.

    `component_source` is required and there is no `composition_html` field, so the
    output schema forces a Remotion f(frame) module — imported from `@decode/animation-api`,
    driven by `useCurrentFrame()`/`interpolate()` — the substrate the browser preview
    and the `/direct` loop both drive. Timing is Remotion's own frame clock inside the
    Sequence Decode lays the scene on, so there are no anchored `beats` to declare.

    In choreography mode the same component is a relational cast, and `script`
    carries the verb list it plays — declared here so the model's structured
    output can carry it without leaving the schema.
    """

    beat_id: str = Field(min_length=1)
    controls: list[SceneControl] = Field(max_length=20)
    component_source: str = Field(min_length=1)
    script: list[ChoreographyVerb] = Field(default_factory=list, max_length=200)

    def to_module(self) -> SceneModule:
        return SceneModule(
            beat_id=self.beat_id,
            controls=self.controls,
            component_source=self.component_source,
            beats=[],
            script=self.script,
        )


class SceneVisualsDraft(BaseModel):
    """What the model produces, without the provenance the harness assembles."""

    rationale: str = Field(min_length=1, max_length=1200)
    scenes: list[SceneDraft] = Field(min_length=1)

    def modules(self) -> list[SceneModule]:
        return [scene.to_module() for scene in self.scenes]


class ModelVisualizer:
    identifier = f"visualizer/{SKILLS.version}"

    def __init__(self, settings: Settings):
        config = AgentConfig.from_skillset(SKILLS)
        self.choreography = settings.choreography == "auto"
        if self.choreography:
            config = config.model_copy(update={"system": CHOREOGRAPHY_SYSTEM})
        self.runtime = AgentRuntime(
            settings,
            config.model_copy(
                update={"model": config.model.model_copy(update={"id": settings.openai_model})}
            ),
        )
        self.model = settings.openai_model
        self.last_usage: ProviderUsage | None = None

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> SceneVisuals:
        narration = {item.beat_id: item.narration for item in script.beats}
        segments = {item.beat_id: item.segments for item in script.beats}
        # Creator's palette wins; then the Director's plan-time choice (the
        # LLM's, once per project). No deterministic fallback — the palette is
        # decided, not drawn from a fixed list.
        palette = intent.palette or (plan.palette.model_dump() if plan.palette else None)
        instructions = build_instructions(
            visual_direction={
                "audience": intent.audience,
                "depth": intent.depth,
                "art_direction": intent.creative_brief,
                "palette": palette,
                "brand_colors": intent.brand.colors,
                "brand_fonts": intent.brand.fonts,
                "brand_guidelines": intent.brand.guidelines,
            },
            beats=[
                {
                    "beat_id": beat.id,
                    "title": beat.title,
                    "objective": beat.objective,
                    "key_points": beat.key_points,
                    "visual_opportunity": beat.visual_opportunity,
                    "narration": narration.get(beat.id, ""),
                    "segments": segments.get(beat.id, []),
                    "duration_seconds": beat.target_duration_seconds,
                }
                for beat in plan.beats
            ],
            choreography=self.choreography,
        )

        scenes, rationale, repair = await self._author(instructions, plan, intent.audience, palette)
        return self._visuals(scenes, rationale, repair)

    def _visuals(self, scenes: list[SceneModule], rationale: str, repair: dict) -> SceneVisuals:
        return SceneVisuals(
            rationale=rationale,
            scenes=scenes,
            visual_findings={
                # Never claim more than the run actually did.
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                "runtime_version": RUNTIME_VERSION,
                "repair": repair,
            },
        )

    async def _author(
        self, instructions: str, plan: TeachingPlan, audience: str, palette: dict | None = None
    ) -> tuple[list[SceneModule], str, dict]:
        """Draft → validate → one repair → SceneModules. The draft-and-gate loop
        behind `generate()`."""
        with tracing.span(
            "visualizer",
            input={
                "audience": audience,
                "structure_name": plan.structure_name,
                "beats": len(plan.beats),
            },
            metadata={
                "skills_version": SKILLS.version,
                "runtime_version": RUNTIME_VERSION,
                "model": self.model,
            },
        ) as run:
            result = await self.runtime.run(
                instructions,
                SceneVisualsDraft,
                validate=lambda draft: validate_scenes(draft.modules(), plan, palette),
                repair_prompt=lambda violations: repair_message(violations, REPAIR_PROMPT),
            )
            draft = result.output
            assert isinstance(draft, SceneVisualsDraft)
            scenes = draft.modules()
            repair = {
                "ran": result.repaired,
                "skills_loaded": list(result.skills_loaded),
                "references_read": list(result.references_read),
            }
            run.update(output={"scenes": len(scenes), "repair": repair})
        self.last_usage = result.usage
        return scenes, draft.rationale, repair

    async def regenerate_one(
        self,
        intent: ProductionIntent,
        plan: TeachingPlan,
        script: Script,
        prior_scenes: list[SceneModule],
        beat_id: str,
        direction: str,
    ) -> SceneVisuals:
        """Rebuild the scene for one beat under a creator's direction.

        This is the per-scene direction loop the product is built on: the creator
        says how they want *this* scene to look, and only this scene changes. Every
        other beat's module is carried through untouched, and the result publishes
        as one new immutable version — so lineage and the whole-artifact model hold
        exactly as they do for a full generation.
        """
        beat = next((item for item in plan.beats if item.id == beat_id), None)
        if beat is None:
            raise ValueError(f"no beat {beat_id!r} in the plan to regenerate")
        current = next((s for s in prior_scenes if s.beat_id == beat_id), None)

        narration = {item.beat_id: item.narration for item in script.beats}
        segments = {item.beat_id: item.segments for item in script.beats}
        # Creator's palette wins; then the Director's plan-time choice (the
        # LLM's, once per project). No deterministic fallback — the palette is
        # decided, not drawn from a fixed list.
        palette = intent.palette or (plan.palette.model_dump() if plan.palette else None)
        instructions = build_instructions(
            visual_direction={
                "audience": intent.audience,
                "depth": intent.depth,
                "art_direction": intent.creative_brief,
                "palette": palette,
                "brand_colors": intent.brand.colors,
                "brand_fonts": intent.brand.fonts,
                "brand_guidelines": intent.brand.guidelines,
            },
            beats=[
                {
                    "beat_id": beat.id,
                    "title": beat.title,
                    "objective": beat.objective,
                    "key_points": beat.key_points,
                    "visual_opportunity": beat.visual_opportunity,
                    "narration": narration.get(beat.id, ""),
                    "segments": segments.get(beat.id, []),
                    "duration_seconds": beat.target_duration_seconds,
                }
            ],
            choreography=self.choreography,
        )
        instructions += (
            "\n\n## Revise this one scene\n\n"
            "You are rewriting the scene for this single beat, not the whole production. "
            "Return exactly this one beat and no others.\n\n"
            "The creator's direction — this is what to change, in their words:\n\n"
            f"{direction}\n"
        )
        if current is not None:
            instructions += (
                "\nThe scene as it stands now. Revise it toward the direction; keep what already "
                "works, change what the direction asks for.\n\n"
                f"```tsx\n{current.component_source or current.composition_html}\n```\n"
            )

        def merge(new_scenes: list[SceneModule]) -> list[SceneModule]:
            fresh = next((s for s in new_scenes if s.beat_id == beat_id), None) or new_scenes[0]
            fresh = fresh.model_copy(update={"beat_id": beat_id})
            if any(s.beat_id == beat_id for s in prior_scenes):
                return [fresh if s.beat_id == beat_id else s for s in prior_scenes]
            # The beat had no scene yet — a plan beat that was never built, so the
            # direction *creates* it. Replacing-only here would drop the fresh
            # module and republish an identical version reporting a change that
            # never happened.
            return [*prior_scenes, fresh]

        with tracing.span(
            "visualizer-regenerate",
            input={"beat_id": beat_id, "direction": direction},
            metadata={"skills_version": SKILLS.version, "model": self.model},
        ) as run:
            result = await self.runtime.run(
                instructions,
                SceneVisualsDraft,
                validate=lambda draft: validate_scenes(merge(draft.modules()), plan, palette),
                repair_prompt=lambda violations: repair_message(violations, REPAIR_PROMPT),
            )
            draft = result.output
            assert isinstance(draft, SceneVisualsDraft)
            merged = merge(draft.modules())

            run.update(output={"beat_id": beat_id, "scenes": len(merged)})

        self.last_usage = result.usage

        return SceneVisuals(
            rationale=(
                f"I redrew the scene for {beat_id} to your direction "
                "and left the rest as they were."
            ),
            scenes=merged,
            visual_findings={
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                "runtime_version": RUNTIME_VERSION,
                "regenerated_beat": beat_id,
                "skills_loaded": list(result.skills_loaded),
                "references_read": list(result.references_read),
            },
        )


def build(settings: Settings) -> ModelVisualizer:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_VISUALIZER=openai")
    return ModelVisualizer(settings)
