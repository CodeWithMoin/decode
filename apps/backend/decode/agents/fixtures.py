"""Deterministic departments.

These are not stubs to be deleted once real departments exist. They are how the
architecture is tested without paying a model bill or debugging provider
variability and domain semantics at the same time, and how the whole suite runs
offline. Every one of them labels its own output as a fixture so nothing
downstream can mistake a sample for a real read.
"""

from __future__ import annotations

import json

from ..schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanSection,
    ProductionBrief,
    ProductionIntent,
    SceneControl,
    SceneModule,
    SceneVisuals,
    Script,
    TeachingPlan,
    Voice,
    VoiceNarration,
)
from ..timing import even_split_words
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
        beats = []
        for beat in plan.beats:
            narration = _filler(target_words(beat.target_duration_seconds), beat.title)
            beats.append(
                BeatNarration(beat_id=beat.id, narration=narration, segments=_segments(narration))
            )
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


def _segments(narration: str) -> list[str]:
    """Deterministically split a passage into ~3 contiguous word-chunks. Not
    semantic (a fixture can't understand) — enough for the visualizer to stage
    moments against and for tests to exercise the segments path."""
    words = narration.split()
    if len(words) < 6:
        return [narration]
    n = min(3, max(2, len(words) // 12))
    size = -(-len(words) // n)  # ceil
    return [" ".join(words[i : i + size]) for i in range(0, len(words), size)]


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
    """One React f(frame) scene: a minimal, contract-valid `component_source` the
    browser preview compiles and the direction loop patches in place. Authoring is
    React (VISUALIZER-TO-HYPERFRAMES reversed) — the fixture emits the same substrate
    the model will, so `/direct` and `GeneratedScene` are exercised, not the retired
    HyperFrames timing seam. The bars derive from a locked `TRACE`, so a direction may
    restyle the scene freely but is refused if it would change the facts."""
    return SceneModule(
        beat_id=beat_id,
        controls=[
            SceneControl(name="background", type="color", label="Background", default="#0B0B0B"),
            SceneControl(name="label", type="string", label="Label", default=label),
        ],
        component_source=_component_source(label),
        # React scenes read `useProgress()` and are not stamped with anchored timing,
        # so there are no `beats` to resolve — the composition/timing seam is HyperFrames-only.
        beats=[],
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


def _component_source(label: str) -> str:
    """A minimal, contract-valid Remotion f(frame) scene: imports only from
    `@decode/animation-api`, drives every moving value with `interpolate(useCurrentFrame(), …)`,
    and default-exports its component (passes `_validate_react`).

    The title is the `label` control and the background is the `background` control —
    both presentation, freely directable. The bars are heights derived from a locked
    `const TRACE`; the direction loop's fact-guard refuses any edit that would change
    it, which is the whole point: restyle freely, but the facts are a projection of
    data, not a thing the model may reword."""
    return (
        'import { AbsoluteFill, useCurrentFrame, interpolate } from "@decode/animation-api";\n'
        "\n"
        "const TRACE = { steps: [3, 1, 4, 1, 5] } as const;\n"
        "\n"
        "export default function Scene({ background = "
        + json.dumps("#0B0B0B")
        + ", label = "
        + json.dumps(label)
        + " }) {\n"
        "  const frame = useCurrentFrame();\n"
        "  const peak = Math.max(...TRACE.steps);\n"
        '  const titleIn = interpolate(frame, [0, 12], [0, 1], '
        '{ extrapolateLeft: "clamp", extrapolateRight: "clamp" });\n'
        "  return (\n"
        '    <AbsoluteFill style={{ color: "#F3F0EA", '
        'fontFamily: "system-ui, sans-serif" }}>\n'
        '      <div style={{ position: "absolute", top: 130, width: "100%", textAlign: '
        '"center", fontSize: 66, fontWeight: 800, opacity: titleIn }}>\n'
        "        {label}\n"
        "      </div>\n"
        '      <div style={{ position: "absolute", top: 380, left: 0, right: 0, height: 480, '
        'display: "flex", gap: 36, justifyContent: "center", alignItems: "flex-end" }}>\n'
        "        {TRACE.steps.map((v, i) => {\n"
        "          const grow = interpolate(frame, [18 + i * 7, 42 + i * 7], [0, 1], "
        '{ extrapolateLeft: "clamp", extrapolateRight: "clamp" });\n'
        "          return (\n"
        "            <div key={i} style={{ width: 118, height: (v / peak) * 440 * grow, "
        'background: "#F2A47B", borderRadius: 14 }} />\n'
        "          );\n"
        "        })}\n"
        "      </div>\n"
        "    </AbsoluteFill>\n"
        "  );\n"
        "}\n"
    )


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
