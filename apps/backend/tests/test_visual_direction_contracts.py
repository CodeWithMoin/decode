"""Contracts between teaching decisions and renderer implementation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from decode.schemas import (
    ChoreographyOperation,
    FilmRhythm,
    FilmRhythmBeat,
    NarrationPhraseAnchor,
    ProjectVisualBible,
    SceneHandoff,
    SceneStoryboard,
    StoryboardSourceBinding,
    StoryboardSubject,
    VisualDirection,
)
from decode.timing import NarrationTiming, Word


def subject(id: str, role: str = "support") -> StoryboardSubject:
    return StoryboardSubject(id=id, role=role, description=f"The {id} teaching object")


def operation(
    id: str,
    action: str,
    subject_ids: list[str],
    phrase: str = "attention moves",
) -> ChoreographyOperation:
    return ChoreographyOperation(
        id=id,
        action=action,
        anchor=NarrationPhraseAnchor(phrase=phrase),
        subject_ids=subject_ids,
        resulting_state=f"{id} has resolved",
    )


def storyboard(beat_id: str, focal: str, subjects: list[StoryboardSubject]) -> SceneStoryboard:
    return SceneStoryboard(
        beat_id=beat_id,
        visual_thesis="Attention redistributes information rather than decorating tokens.",
        metaphor="Tokens cast weighted votes.",
        opening_state="The tokens are present but no relationship is privileged.",
        closing_state="One weighted relationship has become the next idea.",
        focal_subject_id=focal,
        subjects=subjects,
        operations=[operation("focus-query", "focus", [focal])],
    )


def visual_direction() -> VisualDirection:
    first = storyboard(
        "beat-attention",
        "query-token",
        [subject("query-token", "focus"), subject("attention-row", "carrier")],
    )
    second = storyboard(
        "beat-output",
        "weighted-output",
        [subject("weighted-output", "focus"), subject("attention-row", "carrier")],
    )
    return VisualDirection(
        rationale="The same weighted row carries the explanation across the conceptual turn.",
        bible=ProjectVisualBible(
            visual_thesis="Relationships become visible only when the narration names them.",
            typography="Large claims alternate with concise diagram labels.",
            shape_language="Warm flat forms with one visual weight per concept.",
            composition_language="One focal object owns each frame with generous negative space.",
            motion_language="Movement performs the mechanism and settles before each result.",
            continuity_motif="The active weighted row persists across conceptual boundaries.",
            avoid=["idle motion", "repeated card grids"],
        ),
        rhythm=FilmRhythm(
            arc="Establish the mechanism, then arrive on its output.",
            beats=[
                FilmRhythmBeat(
                    beat_id="beat-attention",
                    mode="mechanism",
                    energy="medium",
                    density="medium",
                    pace="steady",
                    pause_after="brief",
                    purpose="Build the relationship progressively.",
                ),
                FilmRhythmBeat(
                    beat_id="beat-output",
                    mode="example",
                    energy="high",
                    density="low",
                    pace="measured",
                    pause_after="full",
                    purpose="Let the resulting representation land.",
                ),
            ],
        ),
        storyboards=[first, second],
        handoffs=[
            SceneHandoff(
                from_beat_id="beat-attention",
                to_beat_id="beat-output",
                intent="arrive",
                bridge="The attention row becomes the weighted output's input.",
                carrier="the active attention row",
                from_subject_id="attention-row",
                to_subject_id="attention-row",
            )
        ],
    )


def test_visual_direction_round_trips_as_json() -> None:
    direction = visual_direction()
    restored = VisualDirection.model_validate(direction.model_dump(mode="json"))
    assert restored == direction
    assert restored.storyboards[0].operations[0].anchor.phrase == "attention moves"


def test_phrase_anchor_re_resolves_with_narration_and_occurrence() -> None:
    anchor = NarrationPhraseAnchor(phrase="attention -- moves", occurrence=2, align="mid")
    timing = NarrationTiming(
        duration=4,
        words=[
            Word(text="attention", start=0.0, end=0.4),
            Word(text="moves", start=0.4, end=0.8),
            Word(text="then", start=0.8, end=1.0),
            Word(text="attention", start=2.0, end=2.5),
            Word(text="moves", start=2.5, end=3.0),
        ],
    )
    slower = NarrationTiming(
        duration=5,
        words=[
            word.model_copy(update={"start": word.start + 0.5, "end": word.end + 0.5})
            for word in timing.words
        ],
    )

    assert anchor.resolve(timing) == 2.5
    assert anchor.resolve(slower) == 3.0
    assert set(anchor.model_dump()) == {"phrase", "align", "occurrence"}


def test_phrase_anchor_ignores_punctuation_only_narration_tokens() -> None:
    anchor = NarrationPhraseAnchor(phrase="attention moves", align="end")
    timing = NarrationTiming(
        duration=2,
        words=[
            Word(text="attention", start=0.0, end=0.5),
            Word(text="--", start=0.5, end=0.6),
            Word(text="moves", start=0.6, end=1.0),
        ],
    )
    assert anchor.resolve(timing) == 1.0


@pytest.mark.parametrize("value", ["", "   ", "...", "---"])
def test_phrase_anchor_rejects_empty_words(value: str) -> None:
    with pytest.raises(ValidationError, match="anchor needs spoken words|at least 1 character"):
        NarrationPhraseAnchor(phrase=value)


def test_storyboard_rejects_duplicate_and_unknown_references() -> None:
    with pytest.raises(ValidationError, match="subject ids must be unique"):
        storyboard("beat-one", "token", [subject("token"), subject("token")])

    with pytest.raises(ValidationError, match="unknown subjects: missing"):
        SceneStoryboard(
            beat_id="beat-one",
            visual_thesis="Show the mechanism.",
            metaphor="A routed signal.",
            opening_state="The route is unresolved.",
            closing_state="The route is selected.",
            focal_subject_id="token",
            subjects=[subject("token", "focus")],
            operations=[operation("trace-route", "trace", ["token", "missing"])],
        )


@pytest.mark.parametrize("action", ["stagger", "transform", "reorder", "compare", "handoff"])
def test_relational_operations_require_multiple_subjects(action: str) -> None:
    with pytest.raises(ValidationError, match="needs at least two subjects"):
        operation("do-work", action, ["only-one"])


def test_operation_vocabulary_excludes_decorative_exit_verbs() -> None:
    schema = ChoreographyOperation.model_json_schema()
    actions = schema["properties"]["action"]["enum"]
    assert "fade" not in actions
    assert "disappear" not in actions
    assert {"trace", "transform", "handoff", "hold"}.issubset(actions)


def test_direction_requires_matching_order_and_every_boundary() -> None:
    dumped = visual_direction().model_dump(mode="json")
    dumped["rhythm"]["beats"].reverse()
    with pytest.raises(ValidationError, match="same beats in the same order"):
        VisualDirection.model_validate(dumped)

    dumped = visual_direction().model_dump(mode="json")
    dumped["handoffs"] = []
    with pytest.raises(ValidationError, match="every adjacent scene boundary"):
        VisualDirection.model_validate(dumped)


def test_handoff_subjects_must_exist_in_their_scenes() -> None:
    dumped = visual_direction().model_dump(mode="json")
    dumped["handoffs"][0]["to_subject_id"] = "unknown-carrier"
    with pytest.raises(ValidationError, match="destination scene"):
        VisualDirection.model_validate(dumped)


def test_reset_boundary_does_not_invent_a_carrier() -> None:
    handoff = SceneHandoff(
        from_beat_id="beat-one",
        to_beat_id="beat-two",
        intent="reset",
        bridge="A deliberate visual reset opens the next chapter.",
    )
    assert handoff.carrier is None

    with pytest.raises(ValidationError, match="reset handoff cannot carry"):
        SceneHandoff(
            from_beat_id="beat-one",
            to_beat_id="beat-two",
            intent="reset",
            bridge="A reset must not retain a stale subject reference.",
            from_subject_id="stale-subject",
        )


def test_contract_is_closed_to_renderer_details() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        NarrationPhraseAnchor(phrase="attention moves", frame=42)
    with pytest.raises(ValidationError):
        StoryboardSubject(
            id="query",
            role="focus",
            description="The query",
            source_binding="<Network progress={frame} />",
        )

    binding = StoryboardSourceBinding(
        beat_id="beat-attention", field="key_point", key_point_index=0
    )
    assert binding.field == "key_point"

    schema = VisualDirection.model_json_schema()
    assert schema["additionalProperties"] is False
    assert all(
        definition.get("additionalProperties") is False
        for definition in schema["$defs"].values()
        if definition.get("type") == "object"
    )
