"""Deterministic departments.

These are not stubs to be deleted once real departments exist. They are how the
architecture is tested without paying a model bill or debugging provider
variability and domain semantics at the same time, and how the whole suite runs
offline. Every one of them labels its own output as a fixture so nothing
downstream can mistake a sample for a real read.
"""

from __future__ import annotations

from ..schemas import (
    Beat,
    BeatNarration,
    BeatStoryboard,
    BriefSupport,
    PlanSection,
    ProductionBrief,
    ProductionIntent,
    SceneControl,
    SceneModule,
    SceneVisuals,
    Script,
    TeachingPlan,
    VisualBeat,
    VisualMoment,
    VisualPlan,
    Voice,
    VoiceNarration,
)
from ..timing import Anchor, even_split_words
from .author.validation import target_words
from .contracts import ProviderUsage, SourceInput
from .evaluator import deterministic_checks, deterministic_plan_checks
from .renderer.validation import RUNTIME_VERSION

OBJECTIVES = (
    "Explain the foundation needed to understand {title}",
    "Trace how the central idea works, one step at a time",
    "Apply the central idea to a practical example",
)


class FakeIntake:
    identifier = "fixture-intake-v1"

    async def generate(
        self, intent: ProductionIntent, sources: list[SourceInput]
    ) -> ProductionBrief:
        direction = (
            f" based on your direction: {intent.creative_brief}" if intent.creative_brief else ""
        )
        return ProductionBrief(
            title="Production Brief",
            summary=f"A sample educational treatment for {intent.audience}{direction}.",
            audience_profile=intent.audience,
            learning_objectives=[
                "Explain the source's central idea",
                "Connect the idea to a practical example",
            ],
            key_concepts=[
                {"name": "Central idea", "importance": "core"},
                {"name": "Practical context", "importance": "supporting"},
            ],
            prerequisites=["No specialist knowledge assumed"],
            scope_in=["Conceptual explanation", "One worked example"],
            scope_out=["Production-ready scene design", "Narration and rendering"],
            source_findings={
                "fixture": True,
                "source_count": len(sources),
                "total_bytes": sum(item.size_bytes for item in sources),
                "note": (
                    "Metadata-only deterministic walking-skeleton findings; "
                    "no extraction was performed."
                ),
            },
            open_questions=[],
        )


class FakeArchitect:
    identifier = "fixture-architect-v2"

    # Roughly one beat per 40 seconds, which is the pace the studio's own sample
    # cut runs at — 8 beats across 5:27. A fixture that always returned three
    # would read as "every video has three scenes" rather than "three acts".
    SECONDS_PER_BEAT = 40
    MIN_BEATS = 3
    MAX_BEATS = 12

    async def generate(self, intent: ProductionIntent, brief: ProductionBrief) -> TeachingPlan:
        total = intent.target_duration_seconds or 180
        count = min(self.MAX_BEATS, max(self.MIN_BEATS, total // self.SECONDS_PER_BEAT))

        # The fixture chooses one named structure. It is not a universal template;
        # it only keeps offline runs deterministic.
        opening = 1 if count < 5 else 2
        closing = 1 if count < 5 else 2
        middle = count - opening - closing
        shape = ["foundation"] * opening + ["working-model"] * middle + ["application"] * closing
        sections = [
            PlanSection(
                id="foundation",
                title="Foundation",
                purpose="Establish the minimum shared mental model.",
            ),
            PlanSection(
                id="working-model",
                title="Working model",
                purpose="Build the central mechanism in a useful order.",
            ),
            PlanSection(
                id="application",
                title="Application",
                purpose="Use the idea and show what understanding enables.",
            ),
        ]

        # Distribute the seconds so they sum to the target exactly. The remainder
        # goes to the earliest mechanism beat rather than being spread as
        # fractions, because a beat duration is a whole number of seconds.
        base = total // count
        remainder = total - (base * count)
        beats = []
        for index, section_id in enumerate(shape):
            seconds = base + (remainder if index == opening else 0)
            beat_id = f"beat-{index + 1:02d}"
            if brief.learning_objectives:
                support = BriefSupport(
                    learning_objectives=[min(index, len(brief.learning_objectives) - 1)]
                )
            elif brief.key_concepts:
                support = BriefSupport(key_concepts=[brief.key_concepts[0].name])
            elif brief.scope_in:
                support = BriefSupport(scope_in=[0])
            else:
                raise ValueError("the approved brief has no supportable teaching material")
            beats.append(
                Beat(
                    id=beat_id,
                    title=f"Beat {index + 1}",
                    objective=OBJECTIVES[min(index, len(OBJECTIVES) - 1)].format(title=brief.title),
                    target_duration_seconds=seconds,
                    section_id=section_id,
                    key_points=["A deterministic sample teaching point from the approved brief."],
                    depends_on=[f"beat-{index:02d}"] if index > 0 else [],
                    brief_support=support,
                    example=(
                        "A sample practical application." if section_id == "application" else None
                    ),
                    visual_opportunity=None,
                )
            )

        return TeachingPlan(
            structure_name="Concept ladder",
            sections=sections,
            through_line=f"A sample shape for {intent.audience}.",
            rationale=(
                f"I split {total} seconds across {count} beats so the working model carries the "
                "middle. These beats are a deterministic fixture, not a reading of the brief."
            ),
            beats=beats,
            plan_findings={
                "fixture": True,
                "brief_title": brief.title,
                "planned_runtime_seconds": sum(b.target_duration_seconds for b in beats),
                "note": "Deterministic walking-skeleton plan; no reasoning was performed.",
            },
        )


class FakeAuthor:
    identifier = "fixture-author-v1"

    async def generate(self, intent: ProductionIntent, plan: TeachingPlan) -> Script:
        # Written to the same word budget the real Author is held to, so the
        # fixture exercises the validation rather than sailing past it.
        beats = [
            BeatNarration(
                beat_id=beat.id,
                narration=_filler(target_words(beat.target_duration_seconds), beat.title),
            )
            for beat in plan.beats
        ]
        return Script(
            rationale=(
                f"I wrote {len(beats)} passages against the approved durations. These words are a "
                "deterministic fixture, not a reading of the plan."
            ),
            beats=beats,
            script_findings={
                "fixture": True,
                "structure_name": plan.structure_name,
                "word_count": sum(len(item.narration.split()) for item in beats),
                "note": "Deterministic walking-skeleton script; no writing was performed.",
            },
        )


def _filler(words: int, title: str) -> str:
    """A passage of exactly `words` words that names the beat it stands in for."""
    opening = f"This is sample narration for {title}.".split()
    if len(opening) >= words:
        return " ".join(opening[:words])
    body = ["The", "Writer", "has", "not", "run", "for", "this", "beat", "yet."]
    out = list(opening)
    while len(out) < words:
        out.append(body[(len(out) - len(opening)) % len(body)])
    return " ".join(out)


def _fixture_scene(beat_id: str, label: str) -> SceneModule:
    """One HyperFrames-native scene: a minimal, contract-valid composition plus one
    anchored beat. Fake mode is HyperFrames, not React — the fixture exercises the
    real composition/timing seam rather than the retired scene API."""
    return SceneModule(
        beat_id=beat_id,
        controls=[
            SceneControl(name="background", type="color", label="Background", default="#0B0B0B"),
            SceneControl(name="label", type="string", label="Label", default=label),
        ],
        composition_html=_composition_html(label),
        # Anchored to the scene's progress, never a hardcoded second: Decode resolves
        # it against the narration and stamps window.__decodeTiming.
        beats=[VisualBeat(name="reveal", anchor=Anchor(name="reveal", kind="progress", at=0.0))],
    )


class FakeVisualizer:
    identifier = "fixture-visualizer-v1"

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> SceneVisuals:
        # Real HyperFrames compositions against the real timing markers, so the
        # fixture exercises validation rather than sailing past it.
        scenes = [_fixture_scene(beat.id, beat.title) for beat in plan.beats]
        return SceneVisuals(
            rationale=(
                f"I drew {len(scenes)} sample scenes against the approved beats. These are a "
                "deterministic fixture, not a reading of the script."
            ),
            scenes=scenes,
            visual_findings={
                "fixture": True,
                "runtime_version": RUNTIME_VERSION,
                "note": "Deterministic walking-skeleton scenes; no design was performed.",
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
        beat = next((item for item in plan.beats if item.id == beat_id), None)
        if beat is None:
            raise ValueError(f"no beat {beat_id!r} in the plan to regenerate")
        fresh = _fixture_scene(beat_id, beat.title)
        scenes = (
            [fresh if s.beat_id == beat_id else s for s in prior_scenes]
            if any(s.beat_id == beat_id for s in prior_scenes)
            else [*prior_scenes, fresh]
        )
        return SceneVisuals(
            rationale=f"I redrew {beat_id} as a deterministic fixture following: {direction!r}.",
            scenes=scenes,
            visual_findings={
                "fixture": True,
                "runtime_version": RUNTIME_VERSION,
                "regenerated_beat": beat_id,
                "note": "Deterministic regenerate; no design was performed.",
            },
        )


class FakeVisualDirector:
    """The Visual Director as a deterministic fixture: an abstract `visual_plan`.

    Produces one storyboard per beat — a metaphor and one narration-anchored moment —
    with no HTML and no seconds. Labels itself a fixture, mirroring every other fake so
    nothing downstream mistakes a sample for a real read. The Renderer (FakeRenderer)
    turns this plan into scene_visuals; in the real runtime that hand-off is an
    in-process delegation on the Agent abstraction.
    """

    identifier = "fixture-visual-director-v1"

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> VisualPlan:
        beats = [
            BeatStoryboard(
                beat_id=beat.id,
                metaphor=f"A single lit surface carrying {beat.title.lower()}.",
                moments=[
                    VisualMoment(
                        shows=f"The idea of '{beat.title}' as one focal surface on the stage.",
                        transition="It eases up from nothing into place, settling.",
                        overlays=[beat.title],
                        anchor=Anchor(name="reveal", kind="progress", at=0.0),
                    )
                ],
            )
            for beat in plan.beats
        ]
        return VisualPlan(
            rationale=(
                f"I storyboarded {len(beats)} beats as single focal surfaces. This is a "
                "deterministic fixture, not a reading of the script."
            ),
            beats=beats,
            visual_findings={
                "fixture": True,
                "note": "Deterministic storyboard; no direction was performed.",
            },
        )


class FakeRenderer:
    """The Renderer as a deterministic fixture: a `visual_plan` → `scene_visuals`.

    Consumes the abstract storyboard and emits the persisted contract unchanged —
    HyperFrames `composition_html` plus one anchored beat per scene. Same output shape
    as `FakeVisualizer.generate`, reached from the storyboard instead of the script.
    """

    identifier = "fixture-renderer-v1"

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, visual_plan: VisualPlan
    ) -> SceneVisuals:
        titles = {beat.id: beat.title for beat in plan.beats}
        scenes = [
            _fixture_scene(board.beat_id, titles.get(board.beat_id, board.beat_id))
            for board in visual_plan.beats
        ]
        return SceneVisuals(
            rationale=(
                f"I rendered {len(scenes)} scenes from the Visual Director's storyboard. This is "
                "a deterministic fixture, not a reading of the plan."
            ),
            scenes=scenes,
            visual_findings={
                "fixture": True,
                "runtime_version": RUNTIME_VERSION,
                "note": "Deterministic render from a visual_plan; no design was performed.",
            },
        )


def _composition_html(label: str) -> str:
    """A minimal, contract-valid HyperFrames composition: root with `data-*`, one
    `.clip`, one paused timeline reading `window.__decodeTiming`, and the duration +
    timing markers Decode fills. The label is inlined as text content so a creator
    edits the thing they see."""
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: #000; }}
      #stage-bg {{ position: absolute; inset: 0; background: #0b0b0b; }}
      #label {{ position: absolute; inset: 0; display: grid; place-items: center;
               font-family: system-ui, sans-serif; font-size: 56px; color: #f3f0ea;
               will-change: transform, opacity; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0"
         data-duration="{{{{SCENE_DURATION}}}}" data-width="1920" data-height="1080">
      <div id="stage-bg"></div>
      <div id="label" class="clip" data-start="0"
           data-duration="{{{{SCENE_DURATION}}}}" data-track-index="1">{label}</div>
    </div>
    <!-- decode:timing -->
    <script>
      window.__timelines = window.__timelines || {{}};
      const timing = window.__decodeTiming || [];
      const at = (name) => timing.find((t) => t.beat === name) || {{ start: 0, duration: 0.6 }};
      const tl = gsap.timeline({{ paused: true }});
      const reveal = at("reveal");
      tl.fromTo("#label", {{ opacity: 0 }},
        {{ opacity: 1, duration: reveal.duration, ease: "power4.out" }}, reveal.start);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""


class FakeNarrator:
    identifier = "fixture-narrator-v1"
    last_usage: ProviderUsage | None = None

    async def generate(self, intent: ProductionIntent, script: Script) -> Voice:
        clips = []
        for item in script.beats:
            duration = max(1.0, round(len(item.narration) / 14.0, 2))
            clips.append(
                VoiceNarration(
                    beat_id=item.beat_id,
                    audio_key=f"fixture-voice/{item.beat_id}.mp3",
                    duration_seconds=duration,
                    # Deterministic even-split timings so the beat-timing model has
                    # real narration to resolve against in the walking skeleton. A
                    # fixture, labelled as one — never a claim of measured alignment.
                    words=even_split_words(item.narration, duration),
                )
            )
        return Voice(
            rationale=(
                f"I read {len(clips)} passages as a deterministic fixture. No audio was "
                "recorded — this labels itself so nothing mistakes a sample for a real read."
            ),
            clips=clips,
            voice_findings={
                "fixture": True,
                "note": "Deterministic walking-skeleton voice; no speech was synthesized.",
            },
        )


class FakeEvaluator:
    identifier = "fixture-evaluator-v2"
    last_usage: ProviderUsage | None = None

    async def evaluate_brief(
        self, intent: ProductionIntent, brief: ProductionBrief
    ) -> tuple[str, list[dict], str]:
        checks = deterministic_checks(brief)
        decision = (
            "pass" if all(item["outcome"] == "pass" for item in checks) else "needs_attention"
        )
        return (
            decision,
            checks,
            "Structured fixture checks completed; human approval remains independent.",
        )

    async def evaluate_plan(
        self, intent: ProductionIntent, brief: ProductionBrief, plan: TeachingPlan
    ) -> tuple[str, list[dict], str]:
        checks = deterministic_plan_checks(intent, brief, plan)
        decision = (
            "pass" if all(item["outcome"] == "pass" for item in checks) else "needs_attention"
        )
        return (
            decision,
            checks,
            "Structured Teaching Plan fixture checks completed; "
            "human approval remains independent.",
        )
