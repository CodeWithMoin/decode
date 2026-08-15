"""The Visualizer department — the Motion Designer's scene visuals.

It reads an approved Script and its plan and writes the animation for each beat
as a **HyperFrames composition** (HTML + one seekable GSAP timeline) plus named
`beats` that anchor each moment to the narration, and the controls a creator may
turn on it. A migration window: legacy scenes may still carry React
`component_source` (VISUALIZER-TO-HYPERFRAMES) — `validation.py` checks each by
its substrate.

Code/markup rather than a JSON visual spec, because a spec can only express what
its schema anticipated and scene visuals are the place that ceiling binds
hardest. The cost is that output has to be validated before it is published —
which `validation.py` does, HyperFrames scenes via the real `hyperframes lint` —
and that a composition is only ever executed in a browser preview or a sandboxed
export renderer, never in this process.

Two departures from how Osmo does the same thing, both forced by Decode's own
rules. A scene never declares its duration, because the approved plan owns
runtime. And the `CONTROLS` manifest is generated here from declared structured
data rather than written by the model, so the settings panel reads JSON instead
of executing a module to discover its knobs.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ...config import Settings
from ...schemas import (
    ProductionIntent,
    SceneControl,
    SceneModule,
    SceneVisuals,
    Script,
    TeachingPlan,
    VisualBeat,
    VisualPlan,
)
from .. import tracing
from .._agent import ModelAgent
from ..agent_config import AgentConfig
from ..agent_runtime import AgentRuntime
from ..contracts import ProviderUsage
from .prompt import SKILLS
from .validation import RUNTIME_VERSION, repair_message, validate_scenes

# One draft, plus at most one targeted repair. There is no tool loop to bound.
MAX_TURNS = 2


class SceneDraft(BaseModel):
    """One scene the model authors — HyperFrames only.

    `composition_html` is required and there is no `component_source` field, so
    the model cannot fall back to React: the output schema forces a HyperFrames
    composition. Converted to a `SceneModule` (which still carries the legacy
    React field for migrated projects) before validation.
    """

    beat_id: str = Field(min_length=1)
    controls: list[SceneControl] = Field(max_length=20)
    composition_html: str = Field(min_length=1)
    beats: list[VisualBeat] = Field(default_factory=list, max_length=40)

    def to_module(self) -> SceneModule:
        return SceneModule(
            beat_id=self.beat_id,
            controls=self.controls,
            composition_html=self.composition_html,
            beats=self.beats,
        )


class SceneVisualsDraft(BaseModel):
    """What the model produces, without the provenance the harness assembles."""

    rationale: str = Field(min_length=1, max_length=1200)
    scenes: list[SceneDraft] = Field(min_length=1)

    def modules(self) -> list[SceneModule]:
        return [scene.to_module() for scene in self.scenes]


class ModelVisualizer(ModelAgent):
    identifier = f"visualizer/{SKILLS.version}"

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> SceneVisuals:
        # Read the owner-authored skills before spending anything: a missing or
        # placeholder skill file must fail here, not after an API call.
        system = SKILLS.system()
        narration = {item.beat_id: item.narration for item in script.beats}
        instructions = SKILLS.instructions(
            visual_direction=json.dumps(
                {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "brand_colors": intent.brand.colors,
                    "brand_guidelines": intent.brand.guidelines,
                },
                ensure_ascii=True,
                indent=2,
            ),
            beats=json.dumps(
                [
                    {
                        "beat_id": beat.id,
                        "title": beat.title,
                        "objective": beat.objective,
                        "key_points": beat.key_points,
                        "visual_opportunity": beat.visual_opportunity,
                        "narration": narration.get(beat.id, ""),
                    }
                    for beat in plan.beats
                ],
                ensure_ascii=True,
                indent=2,
            ),
            # The authoring rules the model follows and the linter enforces are
            # one source (hyperframes-composition.md, gated by `hyperframes lint`).
            composition_contract=SKILLS.reference("hyperframes-composition"),
        )

        scenes, rationale, repair = await self._author(system, instructions, plan, intent.audience)
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
        self, system: str, instructions: str, plan: TeachingPlan, audience: str
    ) -> tuple[list[SceneModule], str, dict]:
        """Draft → validate → one repair → SceneModules. Shared by `generate()` and
        `generate_from_storyboard()`; only the assignment differs, never the gate."""
        history: list = [
            {"role": "user", "content": [{"type": "input_text", "text": instructions}]}
        ]
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
            with tracing.span("draft"):
                draft, input_tokens, output_tokens = await self._draft(
                    system, history, SceneVisualsDraft
                )
            turns = 1
            scenes = draft.modules()
            violations = validate_scenes(scenes, plan)
            repair: dict = {
                "ran": False,
                "initial_violations": [item["code"] for item in violations],
            }
            if violations:
                guidance = SKILLS.reflection() or "Repair the scenes using the listed violations."
                history.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": repair_message(violations, guidance)}
                        ],
                    }
                )
                with tracing.span("repair"):
                    second, extra_in, extra_out = await self._draft(
                        system, history, SceneVisualsDraft
                    )
                scenes = second.modules()
                remaining = validate_scenes(scenes, plan)
                repair = {
                    "ran": True,
                    "initial_violations": [item["code"] for item in violations],
                    "remaining_violations": [item["code"] for item in remaining],
                    "input_tokens": extra_in,
                    "output_tokens": extra_out,
                }
                if remaining:
                    codes = ", ".join(item["code"] for item in remaining)
                    # Never publish a module that failed a static check.
                    raise ValueError(f"visualizer repair failed validation: {codes}")
                draft = second
                input_tokens += extra_in
                output_tokens += extra_out
                turns += 1
            run.update(output={"scenes": len(scenes), "repair": repair})
        self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)
        return scenes, draft.rationale, repair

    def _storyboard_assignment(
        self, intent: ProductionIntent, visual_plan: VisualPlan, narration: dict[str, str]
    ) -> str:
        """The per-beat brief the runtime authors against: the Decode composition
        contract (authoritative), the Visual Director's storyboard, and how to
        realise it. The HyperFrames *craft* is not injected here — the model pulls
        the skills it needs from its on-demand menu."""
        return "".join(
            [
                "## The composition contract (authoritative — timing and structure)\n\n",
                SKILLS.reference("hyperframes-composition"),
                "\n\n## The palette — paint every scene from these exact colours\n\n"
                "The Visual Director chose this palette for the video. Use these values for "
                "every fill, text and accent; they OVERRIDE any hex named in the contract "
                "above. `stage` is the full-frame background, `surface`/`surface_edge` the "
                "diagram surface and its border (keep them distinct), `ink` primary text, "
                "`support` muted text, `accent` the one focal colour.\n\n",
                json.dumps(visual_plan.palette.model_dump(), ensure_ascii=True, indent=2),
                "\n\n## Art direction\n\n",
                json.dumps(
                    {
                        "audience": intent.audience,
                        "depth": intent.depth,
                        "brand_guidelines": intent.brand.guidelines,
                    },
                    ensure_ascii=True,
                    indent=2,
                ),
                "\n\n## The storyboard to render\n\n",
                json.dumps(
                    [
                        {
                            "beat_id": bs.beat_id,
                            "metaphor": bs.metaphor,
                            "moments": [
                                {
                                    "shows": m.shows,
                                    "transition": m.transition,
                                    "overlays": m.overlays,
                                    "anchor": m.anchor.model_dump(),
                                }
                                for m in bs.moments
                            ],
                            "narration": narration.get(bs.beat_id, ""),
                        }
                        for bs in visual_plan.beats
                    ],
                    ensure_ascii=True,
                    indent=2,
                ),
                "\n\n## Render the storyboard — do not reinvent it\n\n"
                "Each beat is an approved storyboard from the Visual Director: a `metaphor` and "
                "ordered `moments`. Build the composition that REALISES it — hold to the metaphor; "
                "make each moment's `shows` appear and move by its `transition` (the A→B motion, "
                "named precisely), place its `overlays` as the labels, and use its `anchor` as "
                "that moment's beat anchor (reuse it verbatim — do not invent new anchors). Emit "
                "one `beats` entry per storyboard moment.\n\n"
                "Before you author, load the HyperFrames skills this beat needs from your menu: "
                "compose the frame off real craft (balance the space, lead the eye to one focal "
                "thing, connect related elements rather than scattering them), and pick motion "
                "from the scene blueprints — do not fall back to a fixed template.\n",
            ]
        )

    async def generate_from_storyboard(
        self,
        intent: ProductionIntent,
        visual_plan: VisualPlan,
        script: Script,
        plan: TeachingPlan,
    ) -> SceneVisuals:
        """Render the Visual Director's storyboard through the agent runtime: the
        model reads the storyboard, pulls only the HyperFrames craft each beat needs
        from its on-demand skill menu (composition, motion, transitions — drilling
        into their references), authors the composition, and takes one lint-repair
        pass gated by `validate_scenes`. Reusing the moment anchors verbatim."""
        config = AgentConfig.from_skillset(SKILLS)
        runtime = AgentRuntime(self.settings, config)
        narration = {item.beat_id: item.narration for item in script.beats}
        assignment = self._storyboard_assignment(intent, visual_plan, narration)

        def _validate(draft: SceneVisualsDraft) -> list[dict]:
            return validate_scenes(draft.modules(), plan)

        def _repair(problems: list) -> str:
            guidance = SKILLS.reflection() or "Repair the scenes using the listed violations."
            return repair_message(problems, guidance)

        with tracing.span(
            "renderer",
            input={"audience": intent.audience, "beats": len(visual_plan.beats)},
            metadata={
                "skills_version": SKILLS.version,
                "runtime_version": RUNTIME_VERSION,
                "model": self.model,
            },
        ) as run:
            result = await runtime.run(
                assignment, SceneVisualsDraft, validate=_validate, repair_prompt=_repair
            )
            draft: SceneVisualsDraft = result.output
            scenes = draft.modules()
            run.update(
                output={"scenes": len(scenes), "skills_loaded": list(result.skills_loaded)}
            )

        self.last_usage = result.usage
        return SceneVisuals(
            rationale=draft.rationale,
            scenes=scenes,
            visual_findings={
                # What the run actually reached for — never claim more than it did.
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                "runtime_version": RUNTIME_VERSION,
                "skills_loaded": list(result.skills_loaded),
                "references_read": list(result.references_read),
                "tools_called": list(result.tools_called),
                "delegated_to": list(result.delegated_to),
                "repaired": result.repaired,
            },
        )

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

        system = SKILLS.system()
        narration = {item.beat_id: item.narration for item in script.beats}
        instructions = SKILLS.instructions(
            visual_direction=json.dumps(
                {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "brand_colors": intent.brand.colors,
                    "brand_guidelines": intent.brand.guidelines,
                },
                ensure_ascii=True,
                indent=2,
            ),
            beats=json.dumps(
                [
                    {
                        "beat_id": beat.id,
                        "title": beat.title,
                        "objective": beat.objective,
                        "key_points": beat.key_points,
                        "visual_opportunity": beat.visual_opportunity,
                        "narration": narration.get(beat.id, ""),
                    }
                ],
                ensure_ascii=True,
                indent=2,
            ),
            composition_contract=SKILLS.reference("hyperframes-composition"),
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
                f"```html\n{current.composition_html or current.component_source}\n```\n"
            )

        history: list = [
            {"role": "user", "content": [{"type": "input_text", "text": instructions}]}
        ]

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
            with tracing.span("draft"):
                draft, input_tokens, output_tokens = await self._draft(
                    system, history, SceneVisualsDraft
                )
            turns = 1

            merged = merge(draft.modules())
            violations = validate_scenes(merged, plan)
            if violations:
                guidance = SKILLS.reflection() or "Repair the scene using the listed violations."
                history.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": repair_message(violations, guidance)}
                        ],
                    }
                )
                with tracing.span("repair"):
                    second, extra_in, extra_out = await self._draft(
                        system, history, SceneVisualsDraft
                    )
                merged = merge(second.modules())
                remaining = validate_scenes(merged, plan)
                if remaining:
                    codes = ", ".join(item["code"] for item in remaining)
                    raise ValueError(f"visualizer regenerate failed validation: {codes}")
                input_tokens += extra_in
                output_tokens += extra_out
                turns += 1

            run.update(output={"beat_id": beat_id, "scenes": len(merged)})

        self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)

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
            },
        )


def build(settings: Settings) -> ModelVisualizer:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_VISUALIZER=openai")
    return ModelVisualizer(settings)
