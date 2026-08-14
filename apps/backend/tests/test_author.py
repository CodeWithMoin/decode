from types import SimpleNamespace

import pytest

from decode.config import Settings
from decode.departments.author import OpenAIAuthor, ScriptDraft, prompt
from decode.departments.author.validation import (
    TOLERANCE,
    target_words,
    validate_script,
    word_count,
)
from decode.departments.registry import author as build_author
from decode.execution.pipeline import STAGES
from decode.models import ArtifactType
from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanSection,
    ProductionIntent,
    TeachingPlan,
)

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
)

PLAN = TeachingPlan(
    structure_name="Question to answer",
    sections=[
        PlanSection(
            id="question", title="The question", purpose="Establish what must be explained."
        ),
        PlanSection(id="answer", title="The answer", purpose="Close the question."),
    ],
    through_line="Attention lets a model weigh what matters.",
    rationale="I opened on the failure so the mechanism has something to fix.",
    beats=[
        Beat(
            id="beat-01",
            title="The bottleneck",
            objective="Explain why the existing sequence model loses useful context",
            target_duration_seconds=20,
            section_id="question",
            key_points=["The old model compresses context into one state."],
            brief_support=BriefSupport(learning_objectives=[0]),
        ),
        Beat(
            id="beat-02",
            title="What it bought",
            objective="Explain what direct token relationships make possible",
            target_duration_seconds=40,
            section_id="answer",
            key_points=["Each token can use relevant context directly."],
            depends_on=["beat-01"],
            brief_support=BriefSupport(scope_in=[0]),
        ),
    ],
)


def passage(words: int) -> str:
    return " ".join(["word"] * words)


def on_budget() -> list[BeatNarration]:
    return [
        BeatNarration(
            beat_id=beat.id, narration=passage(target_words(beat.target_duration_seconds))
        )
        for beat in PLAN.beats
    ]


def test_the_stage_is_discovered_from_its_manifest():
    # Adding a department is a folder: nothing hand-registers this.
    stage = STAGES["generate_script"]
    assert stage.produces == ArtifactType.SCRIPT
    assert stage.consumes == ("teaching_plan", "production_intent")
    assert stage.owner_role == "writer"
    assert stage.provider_setting == "author"


def test_shipped_skills_load():
    # Guards the real markdown: an unknown {placeholder} in instructions.md would
    # otherwise surface one paid API call too late.
    system = prompt.SKILLS.system()
    assert "untrusted content" in system
    assert "spoken narration" in system
    rendered = prompt.SKILLS.instructions(narration_direction='{"audience":"Beginners"}', plan="{}")
    assert "Beginners" in rendered
    assert "{narration_direction}" not in rendered
    assert "{plan}" not in rendered


def test_author_requires_a_key(tmp_path):
    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build_author(Settings(author="openai", openai_api_key=None, local_object_root=tmp_path))


def test_a_script_on_budget_has_no_violations():
    assert validate_script(on_budget(), PLAN) == []


def test_a_long_passage_is_caught():
    over = on_budget()
    target = target_words(PLAN.beats[0].target_duration_seconds)
    over[0] = BeatNarration(beat_id="beat-01", narration=passage(round(target * 1.5)))
    codes = [item["code"] for item in validate_script(over, PLAN)]
    assert codes == ["word_budget"]


def test_a_passage_inside_tolerance_passes():
    # The tolerance is the point: ordinary sentence-length variation must not
    # cost a paid repair turn.
    near = on_budget()
    target = target_words(PLAN.beats[0].target_duration_seconds)
    near[0] = BeatNarration(
        beat_id="beat-01", narration=passage(target - round(target * TOLERANCE))
    )
    assert validate_script(near, PLAN) == []


def test_missing_and_invented_beats_are_both_caught():
    codes = [
        item["code"]
        for item in validate_script(
            [BeatNarration(beat_id="beat-99", narration=passage(100))], PLAN
        )
    ]
    assert "missing_beats" in codes
    assert "unknown_beats" in codes


def test_reordered_passages_are_caught():
    # A correct set of passages in the wrong sequence is still the wrong video.
    codes = [item["code"] for item in validate_script(list(reversed(on_budget())), PLAN)]
    assert "beat_order" in codes


class FakeResponses:
    def __init__(self, drafts):
        self.drafts = list(drafts)
        self.calls = 0

    async def parse(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(usage=None, output=[], output_parsed=self.drafts.pop(0))


def author_with(monkeypatch, drafts, reflection: str | None):
    writer = OpenAIAuthor.__new__(OpenAIAuthor)
    writer.model = "test-model"
    writer.client = SimpleNamespace(responses=FakeResponses(drafts))
    writer.last_usage = None
    monkeypatch.setattr(prompt.SKILLS, "system", lambda: "system")
    monkeypatch.setattr(prompt.SKILLS, "instructions", lambda **kw: "instructions")
    monkeypatch.setattr(prompt.SKILLS, "reflection", lambda: reflection)
    return writer


DRAFT = ScriptDraft(rationale="I spent the budget on the mechanism.", beats=on_budget())


async def test_a_valid_script_skips_repair(monkeypatch):
    writer = author_with(monkeypatch, [DRAFT], reflection="repair")
    script = await writer.generate(INTENT, PLAN)
    assert writer.client.responses.calls == 1
    assert script.script_findings["fixture"] is False
    assert script.script_findings["repair"] == {"ran": False, "initial_violations": []}
    # Word count is recorded as provenance, never as a field free to disagree
    # with the words themselves.
    assert script.script_findings["word_count"] == sum(
        word_count(item.narration) for item in script.beats
    )


async def test_an_over_budget_script_gets_one_targeted_repair(monkeypatch):
    over = DRAFT.model_copy(
        update={
            "beats": [
                BeatNarration(beat_id="beat-01", narration=passage(400)),
                DRAFT.beats[1],
            ]
        }
    )
    writer = author_with(monkeypatch, [over, DRAFT], reflection="repair")
    script = await writer.generate(INTENT, PLAN)
    assert writer.client.responses.calls == 2
    assert script.script_findings["repair"]["initial_violations"] == ["word_budget"]
    assert script.script_findings["repair"]["remaining_violations"] == []


async def test_a_failed_repair_is_not_published(monkeypatch):
    over = DRAFT.model_copy(
        update={
            "beats": [
                BeatNarration(beat_id="beat-01", narration=passage(400)),
                DRAFT.beats[1],
            ]
        }
    )
    writer = author_with(monkeypatch, [over, over], reflection="repair")
    with pytest.raises(ValueError, match="word_budget"):
        await writer.generate(INTENT, PLAN)
    assert writer.client.responses.calls == 2


async def test_the_fixture_writes_to_every_budget():
    # The fixture has to be arithmetically honest, or offline runs teach the
    # wrong lesson about what a script owes the plan.
    from decode.departments.fixtures import FakeAuthor

    script = await FakeAuthor().generate(INTENT, PLAN)
    assert validate_script(script.beats, PLAN) == []
    assert script.script_findings["fixture"] is True
