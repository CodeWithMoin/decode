"""Visual direction must remain grounded in its approved Plan and Script."""

from __future__ import annotations

from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    ChoreographyOperation,
    FilmRhythm,
    FilmRhythmBeat,
    NarrationPhraseAnchor,
    PlanSection,
    ProjectVisualBible,
    SceneStoryboard,
    Script,
    StoryboardSubject,
    TeachingPlan,
    VisualDirection,
)
from decode.visual_direction import validate_visual_direction


def plan() -> TeachingPlan:
    return TeachingPlan(
        structure_name="Mechanism to consequence",
        sections=[PlanSection(id="mechanism", title="Mechanism", purpose="Explain the operation")],
        through_line="A weighted relationship becomes a useful output.",
        rationale="The mechanism must be understood before its consequence.",
        beats=[
            Beat(
                id="beat-attention",
                title="Attention moves",
                objective="Explain how attention redistributes information.",
                target_duration_seconds=20,
                section_id="mechanism",
                key_points=["The query compares tokens", "Weights select information"],
                brief_support=BriefSupport(learning_objectives=[0]),
            )
        ],
    )


def script(
    narration: str = "The query compares tokens, then attention moves to the result.",
) -> Script:
    return Script(
        rationale="Name each state when it becomes visible.",
        beats=[BeatNarration(beat_id="beat-attention", narration=narration)],
    )


def direction(operations: list[ChoreographyOperation] | None = None) -> VisualDirection:
    return VisualDirection(
        rationale="Build the mechanism in spoken order.",
        bible=ProjectVisualBible(
            visual_thesis="Relationships appear only when named.",
            typography="Use large claims and concise labels.",
            shape_language="Use flat forms with stable semantic identities.",
            composition_language="Keep one focal object in generous negative space.",
            motion_language="Movement performs the mechanism and then settles.",
            continuity_motif="The active relationship carries the explanation.",
        ),
        rhythm=FilmRhythm(
            arc="Build and resolve one mechanism.",
            beats=[
                FilmRhythmBeat(
                    beat_id="beat-attention",
                    mode="mechanism",
                    energy="medium",
                    density="medium",
                    pace="steady",
                    pause_after="full",
                    purpose="Reveal the relationship progressively.",
                )
            ],
        ),
        storyboards=[
            SceneStoryboard(
                beat_id="beat-attention",
                visual_thesis="The query creates a weighted relationship.",
                metaphor="Tokens cast weighted votes.",
                opening_state="The tokens have no visible relationship.",
                closing_state="The selected relationship points to the result.",
                focal_subject_id="query",
                subjects=[
                    StoryboardSubject(id="query", role="focus", description="The active query"),
                    StoryboardSubject(
                        id="result", role="carrier", description="The selected result"
                    ),
                ],
                operations=operations
                or [
                    ChoreographyOperation(
                        id="activate-query",
                        action="focus",
                        anchor=NarrationPhraseAnchor(phrase="query"),
                        subject_ids=["query"],
                        resulting_state="The query is active.",
                    ),
                    ChoreographyOperation(
                        id="trace-result",
                        action="trace",
                        anchor=NarrationPhraseAnchor(phrase="attention moves"),
                        subject_ids=["query", "result"],
                        resulting_state="The relationship reaches the result.",
                    ),
                ],
            )
        ],
    )


def codes(violations: list[dict[str, str]]) -> set[str]:
    return {violation["code"] for violation in violations}


def test_direction_matches_approved_sources() -> None:
    assert validate_visual_direction(direction(), plan(), script()) == []


def test_invented_beat_is_rejected_against_the_plan() -> None:
    dumped = direction().model_dump(mode="json")
    dumped["rhythm"]["beats"][0]["beat_id"] = "beat-invented"
    dumped["storyboards"][0]["beat_id"] = "beat-invented"
    violations = validate_visual_direction(VisualDirection.model_validate(dumped), plan(), script())
    assert "plan_beat_mismatch" in codes(violations)


def test_missing_phrase_is_surfaced() -> None:
    violations = validate_visual_direction(
        direction(), plan(), script("The query compares tokens.")
    )
    assert "unresolved_operation_anchor" in codes(violations)


def test_operation_order_and_end_order_follow_narration() -> None:
    operations = [
        ChoreographyOperation(
            id="late",
            action="focus",
            anchor=NarrationPhraseAnchor(phrase="attention moves"),
            end_anchor=NarrationPhraseAnchor(phrase="query"),
            subject_ids=["query"],
            resulting_state="The late state resolves.",
        ),
        ChoreographyOperation(
            id="early",
            action="focus",
            anchor=NarrationPhraseAnchor(phrase="query"),
            subject_ids=["query"],
            resulting_state="The early state resolves.",
        ),
    ]
    found = codes(validate_visual_direction(direction(operations), plan(), script()))
    assert "operation_end_before_start" in found
    assert "operation_order" in found


def test_source_binding_must_reference_an_existing_plan_field() -> None:
    dumped = direction().model_dump(mode="json")
    dumped["storyboards"][0]["subjects"][0]["source_binding"] = {
        "beat_id": "beat-attention",
        "field": "key_point",
        "key_point_index": 4,
    }
    violations = validate_visual_direction(
        VisualDirection.model_validate(dumped), plan(), script()
    )
    assert "invalid_source_binding" in codes(violations)
