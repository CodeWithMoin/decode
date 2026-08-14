from types import SimpleNamespace

import pytest

from decode.config import Settings
from decode.departments.evaluator import (
    SYSTEM,
    CheckResult,
    EvaluationDraft,
    OpenAIEvaluator,
    PlanEvaluationDraft,
)
from decode.departments.registry import evaluator as build_evaluator
from decode.schemas import Beat, PlanSection, ProductionBrief, ProductionIntent, TeachingPlan

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
)

BRIEF = ProductionBrief(
    title="Attention",
    summary="A grounded introduction to self-attention.",
    audience_profile="Curious beginners",
    learning_objectives=["Explain how tokens weigh one another"],
    key_concepts=[{"name": "Self-attention", "importance": "core"}],
    prerequisites=[],
    scope_in=["Queries, keys, and values"],
    scope_out=["Training infrastructure"],
    source_findings={"fixture": False, "findings": [{"locator": "page 2"}]},
    open_questions=[],
)

PLAN = TeachingPlan(
    structure_name="Question to answer",
    sections=[
        PlanSection(id="question", title="Question", purpose="Establish the learning need."),
        PlanSection(id="answer", title="Answer", purpose="Build and apply the mechanism."),
    ],
    through_line="Tokens learn which other tokens matter.",
    rationale="I established the need before building the answer.",
    beats=[
        Beat(
            id="beat-01",
            title="The need",
            objective="Explain why token relationships matter",
            target_duration_seconds=60,
            section_id="question",
            key_points=["Context changes meaning."],
            brief_support={"learning_objectives": [0]},
        ),
        Beat(
            id="beat-02",
            title="The mechanism",
            objective="Trace how tokens weigh one another",
            target_duration_seconds=120,
            section_id="answer",
            key_points=["Queries meet keys."],
            depends_on=["beat-01"],
            brief_support={"key_concepts": ["Self-attention"]},
        ),
    ],
)


class FakeResponses:
    def __init__(self, draft):
        self.draft = draft
        self.kwargs = None

    async def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            output_parsed=self.draft,
            usage=SimpleNamespace(input_tokens=120, output_tokens=40),
        )


def result(outcome, evidence):
    return CheckResult(outcome=outcome, evidence=evidence)


async def test_openai_evaluator_derives_decision_and_records_usage():
    draft = EvaluationDraft(
        direction_alignment=result("pass", "The audience matches."),
        scope_fit=result("fail", "The scope exceeds three minutes."),
        objective_concept_coherence=result("pass", "The objective names the core concept."),
        provenance_honesty=result("pass", "The findings disclose a real read."),
        downstream_reviewability=result("pass", "Scope boundaries are explicit."),
        summary="The brief needs a narrower scope.",
    )
    judge = OpenAIEvaluator.__new__(OpenAIEvaluator)
    judge.model = "judge-model"
    responses = FakeResponses(draft)
    judge.client = SimpleNamespace(responses=responses)
    judge.last_usage = None

    decision, checks, summary = await judge.evaluate_brief(INTENT, BRIEF)

    assert decision == "needs_attention"
    scope_check = next(check for check in checks if check["name"] == "scope_fit")
    assert scope_check["outcome"] == "fail"
    assert summary == "The brief needs a narrower scope."
    assert judge.last_usage.model == "judge-model"
    assert judge.last_usage.input_tokens == 120
    assert responses.kwargs["model"] == "judge-model"
    prompt = responses.kwargs["input"][0]["content"][0]["text"]
    assert "Curious beginners" in prompt
    assert "production_brief" in prompt


async def test_unavailable_check_makes_the_whole_evaluation_unavailable():
    unavailable = result("unable_to_evaluate", "No provenance was supplied.")
    draft = EvaluationDraft(
        direction_alignment=result("pass", "The audience matches."),
        scope_fit=result("pass", "The scope fits."),
        objective_concept_coherence=result("pass", "The brief is coherent."),
        provenance_honesty=unavailable,
        downstream_reviewability=result("pass", "The brief is reviewable."),
        summary="Provenance could not be evaluated.",
    )
    judge = OpenAIEvaluator.__new__(OpenAIEvaluator)
    judge.model = "judge-model"
    judge.client = SimpleNamespace(responses=FakeResponses(draft))
    judge.last_usage = None

    decision, _, _ = await judge.evaluate_brief(INTENT, BRIEF)
    assert decision == "unable_to_evaluate"


async def test_structural_failure_skips_the_model_judge():
    judge = OpenAIEvaluator.__new__(OpenAIEvaluator)
    judge.model = "judge-model"
    responses = FakeResponses(None)
    judge.client = SimpleNamespace(responses=responses)
    judge.last_usage = None
    incomplete = BRIEF.model_copy(update={"learning_objectives": []})

    decision, checks, summary = await judge.evaluate_brief(INTENT, incomplete)

    assert decision == "needs_attention"
    assert responses.kwargs is None
    assert checks[0]["outcome"] == "fail"
    assert "did not run" in summary
    assert judge.last_usage is None


async def test_teaching_plan_receives_its_own_semantic_evaluation():
    draft = PlanEvaluationDraft(
        direction_and_depth_fit=result("pass", "The sequence fits beginners."),
        teaching_sequence=result("pass", "The dependency is introduced first."),
        beat_granularity=result("pass", "Each beat makes one promise."),
        approved_scope_grounding=result("pass", "Every beat maps to approved material."),
        writer_handoff_quality=result("pass", "Key points guide writing without scripting."),
        summary="The plan is ready for creator review.",
    )
    judge = OpenAIEvaluator.__new__(OpenAIEvaluator)
    judge.model = "judge-model"
    responses = FakeResponses(draft)
    judge.client = SimpleNamespace(responses=responses)
    judge.last_usage = None

    decision, checks, summary = await judge.evaluate_plan(INTENT, BRIEF, PLAN)

    assert decision == "pass"
    assert any(check["name"] == "teaching_sequence" for check in checks)
    assert summary == "The plan is ready for creator review."
    prompt = responses.kwargs["input"][0]["content"][0]["text"]
    assert "teaching_plan" in prompt
    assert "approved_production_brief" in prompt
    assert "untrusted data" in SYSTEM


def test_openai_evaluator_requires_a_key():
    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build_evaluator(Settings(evaluator="openai", openai_api_key=None))
