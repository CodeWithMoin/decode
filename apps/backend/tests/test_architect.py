from types import SimpleNamespace

import pytest

from decode.agents.architect import ModelArchitect, TeachingPlanDraft, prompt
from decode.agents.registry import architect as build_architect
from decode.config import Settings
from decode.execution.pipeline import STAGES, stage_for
from decode.models import ArtifactType
from decode.schemas import Beat, PlanPalette, PlanSection, ProductionBrief, ProductionIntent

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
)

BRIEF = ProductionBrief(
    title="Attention",
    summary="A treatment.",
    audience_profile="Curious beginners",
    learning_objectives=["Explain self-attention"],
    key_concepts=[{"name": "Self-attention", "importance": "core"}],
    prerequisites=[],
    scope_in=["The core idea"],
    scope_out=["Training details"],
    source_findings={"fixture": True},
    open_questions=[],
)

DRAFT = TeachingPlanDraft(
    palette=PlanPalette(
        surface="#232323", border="#484848", ink="#F0F6F1", support="#8A8A86", accent="#F2A47B"
    ),
    structure_name="Question to answer",
    sections=[
        PlanSection(
            id="question", title="The question", purpose="Establish what must be explained."
        ),
        PlanSection(id="model", title="The working model", purpose="Build the mechanism in order."),
        PlanSection(
            id="answer", title="The answer", purpose="Apply the model and close the question."
        ),
    ],
    through_line="Attention lets a model weigh what matters.",
    rationale="I opened on the failure so the mechanism has something to fix.",
    beats=[
        Beat(
            id="beat-01",
            title="The bottleneck",
            objective="Explain why the existing sequence model loses useful context",
            target_duration_seconds=45,
            section_id="question",
            key_points=["The old model compresses context into one state."],
            brief_support={"learning_objectives": [0]},
        ),
        Beat(
            id="beat-02",
            title="Queries and keys",
            objective="Trace how tokens use queries and keys to address each other",
            target_duration_seconds=90,
            section_id="model",
            key_points=[
                "Queries express what a token needs.",
                "Keys express what each token offers.",
            ],
            depends_on=["beat-01"],
            brief_support={"key_concepts": ["Self-attention"]},
        ),
        Beat(
            id="beat-03",
            title="What it bought",
            objective="Explain what direct token relationships make possible",
            target_duration_seconds=45,
            section_id="answer",
            key_points=["Each token can use relevant context directly."],
            depends_on=["beat-02"],
            brief_support={"scope_in": [0]},
        ),
    ],
)


def test_shipped_skills_load():
    # Guards the real markdown: an unknown {placeholder} in instructions.md would
    # otherwise surface one paid API call too late.
    system = prompt.SKILLS.system()
    assert "untrusted content" in system
    assert "no mandatory three-act" in system
    rendered = prompt.SKILLS.instructions(
        planning_direction='{"audience":"Beginners"}',
        brief="{}",
    )
    assert "Beginners" in rendered
    assert "{planning_direction}" not in rendered
    assert "{brief}" not in rendered


def test_architect_requires_a_key(tmp_path):
    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build_architect(
            Settings(architect="openai", openai_api_key=None, local_object_root=tmp_path)
        )


class FakeResponses:
    def __init__(self, drafts):
        self.drafts = list(drafts)
        self.calls = 0

    async def parse(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(usage=None, output=[], output_parsed=self.drafts.pop(0))


def architect_with(monkeypatch, drafts, reflection: str | None):
    director = ModelArchitect.__new__(ModelArchitect)
    director.model = "test-model"
    director.client = SimpleNamespace(responses=FakeResponses(drafts))
    director.last_usage = None
    monkeypatch.setattr(prompt.SKILLS, "system", lambda: "system")
    monkeypatch.setattr(prompt.SKILLS, "instructions", lambda **kw: "instructions")
    monkeypatch.setattr(prompt.SKILLS, "reflection", lambda: reflection)
    return director


async def test_plan_records_its_own_runtime(monkeypatch):
    director = architect_with(monkeypatch, [DRAFT], reflection=None)
    plan = await director.generate(INTENT, BRIEF)
    # The sum is the only runtime that exists. It is recorded as provenance, not
    # as a field on the plan, so it can never disagree with the beats.
    assert plan.plan_findings["planned_runtime_seconds"] == 180
    assert plan.plan_findings["fixture"] is False
    assert plan.plan_findings["repair"] == {"ran": False, "initial_violations": []}


async def test_invalid_plan_gets_one_targeted_repair(monkeypatch):
    invalid = DRAFT.model_copy(
        update={
            "beats": [
                *DRAFT.beats[:-1],
                DRAFT.beats[-1].model_copy(update={"target_duration_seconds": 40}),
            ]
        }
    )
    revised = DRAFT.model_copy(update={"through_line": "A sharper line."})
    director = architect_with(monkeypatch, [invalid, revised], reflection="repair")
    plan = await director.generate(INTENT, BRIEF)
    assert director.client.responses.calls == 2
    assert plan.through_line == "A sharper line."
    assert plan.plan_findings["repair"]["initial_violations"] == ["runtime_budget"]
    assert plan.plan_findings["repair"]["remaining_violations"] == []


async def test_valid_plan_skips_repair(monkeypatch):
    director = architect_with(monkeypatch, [DRAFT], reflection="repair")
    await director.generate(INTENT, BRIEF)
    assert director.client.responses.calls == 1


async def test_variable_two_section_structure_is_valid(monkeypatch):
    two_sections = DRAFT.model_copy(
        update={
            "structure_name": "Foundation to application",
            "sections": [DRAFT.sections[0], DRAFT.sections[2]],
            "beats": [
                DRAFT.beats[0],
                DRAFT.beats[1].model_copy(update={"section_id": "answer"}),
                DRAFT.beats[2],
            ],
        }
    )
    director = architect_with(monkeypatch, [two_sections], reflection="repair")
    plan = await director.generate(INTENT, BRIEF)
    assert len(plan.sections) == 2
    assert director.client.responses.calls == 1


async def test_invalid_repair_is_not_published(monkeypatch):
    invalid = DRAFT.model_copy(
        update={
            "beats": [
                *DRAFT.beats[:-1],
                DRAFT.beats[-1].model_copy(update={"target_duration_seconds": 40}),
            ]
        }
    )
    director = architect_with(monkeypatch, [invalid, invalid], reflection="repair")
    with pytest.raises(ValueError, match="runtime_budget"):
        await director.generate(INTENT, BRIEF)
    assert director.client.responses.calls == 2


async def test_fake_architect_meets_the_requested_runtime():
    # The fixture has to be arithmetically honest at any target, or it teaches
    # the wrong lesson about what a plan owes the creator.
    from decode.agents.fixtures import FakeArchitect

    for seconds in (60, 180, 300, 600):
        intent = INTENT.model_copy(update={"target_duration_seconds": seconds})
        plan = await FakeArchitect().generate(intent, BRIEF)
        assert sum(b.target_duration_seconds for b in plan.beats) == seconds
        assert {b.section_id for b in plan.beats} == {section.id for section in plan.sections}
        assert all(beat.brief_support.learning_objectives for beat in plan.beats)


def test_the_plan_stage_consumes_the_brief_not_the_sources():
    # Handing the Architect the raw document again would let it re-admit
    # everything the creator approved cutting.
    stage = stage_for("generate_teaching_plan")
    assert stage.produces == ArtifactType.TEACHING_PLAN
    assert stage.schema_version == 2
    assert set(stage.consumes) == {"production_brief", "production_intent"}
    assert "source" not in stage.consumes


def test_every_stage_declares_a_provider_setting():
    # A stage whose provider_setting names a field Settings does not have would
    # only fail at run time, inside the worker, after the job was queued.
    settings = Settings()
    for stage in STAGES.values():
        assert hasattr(settings, stage.provider_setting), stage.kind
