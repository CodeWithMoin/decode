from types import SimpleNamespace

import pytest

from decode.agents import intake
from decode.agents.intake import IntakeBriefDraft, ModelIntake, prompt
from decode.agents.intake.tools import FindingLog
from decode.agents.registry import intake as build_intake
from decode.config import Settings
from decode.schemas import ProductionIntent

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
)


def test_placeholder_skills_refuse_to_run(tmp_path, monkeypatch):
    # The department must not spend an API call on skills nobody has written.
    untouched = tmp_path / "SKILL.md"
    untouched.write_text(
        "---\nname: x\n---\n\nTODO: written by the product owner, not generated.\n"
    )
    monkeypatch.setattr(prompt.SKILLS, "directory", untouched.parent)
    with pytest.raises(ValueError, match="placeholder"):
        prompt.SKILLS.system()


def test_shipped_skills_load():
    # Guards the real files: a stray brace or an unknown {placeholder} in
    # instructions.md would only surface here, one API call too late otherwise.
    system = prompt.SKILLS.system()
    assert "untrusted content" in system
    rendered = prompt.build_instructions(INTENT, source_count=2)
    assert "Curious beginners" in rendered
    assert "{production_direction}" not in rendered
    assert "{source_count}" not in rendered


def test_missing_skill_file_names_itself(tmp_path, monkeypatch):
    monkeypatch.setattr(prompt.SKILLS, "directory", tmp_path / "empty")
    with pytest.raises(FileNotFoundError, match="SKILL.md"):
        prompt.SKILLS.system()


def test_instructions_substitute_intent(tmp_path, monkeypatch):
    written = tmp_path / "instructions.md"
    written.write_text("direction={production_direction} sources={source_count}")
    monkeypatch.setattr(prompt.SKILLS, "directory", written.parent)
    rendered = prompt.build_instructions(INTENT, source_count=2)
    assert '"audience": "Curious beginners"' in rendered
    assert '"target_duration_seconds": 180' in rendered
    assert "narration_style" not in rendered
    assert "sources=2" in rendered


def test_deep_dive_renders_open_runtime(tmp_path, monkeypatch):
    written = tmp_path / "instructions.md"
    written.write_text("direction={production_direction}")
    monkeypatch.setattr(prompt.SKILLS, "directory", written.parent)
    intent = ProductionIntent(
        audience="Engineers",
        runtime_mode="deep_dive",
        depth="rigorous",
        narration_style="professional",
    )
    rendered = prompt.build_instructions(intent, 1)
    assert '"runtime_mode": "deep_dive"' in rendered
    assert '"target_duration_seconds": null' in rendered


def test_reflection_is_off_until_written(tmp_path, monkeypatch):
    # An absent, empty or untouched file all mean "no reflection turn".
    monkeypatch.setattr(prompt.SKILLS, "directory", tmp_path / "empty")
    assert prompt.SKILLS.reflection() is None
    empty = tmp_path / "reflection.md"
    empty.write_text("   \n")
    monkeypatch.setattr(prompt.SKILLS, "directory", empty.parent)
    assert prompt.SKILLS.reflection() is None


def test_shipped_reflection_is_written():
    # Reflection now ships written; if it is ever blanked, the harness silently
    # goes back to publishing first drafts, so say it out loud here.
    assert prompt.SKILLS.reflection()


def test_reflection_prompt_is_returned_once_written(tmp_path, monkeypatch):
    written = tmp_path / "reflection.md"
    written.write_text("Check every claim against what you recorded.\n")
    monkeypatch.setattr(prompt.SKILLS, "directory", written.parent)
    assert prompt.SKILLS.reflection() == "Check every claim against what you recorded."


def test_finding_log_collects_and_rejects_unknown_tools():
    log = FindingLog()
    log.dispatch(
        "record_finding",
        {
            "claim": "Self-attention replaces recurrence.",
            "source_filename": "attention.pdf",
            "locator": "page 2",
            "shapes": "concept",
        },
    )
    assert len(log.entries) == 1
    assert log.entries[0]["locator"] == "page 2"
    with pytest.raises(ValueError, match="unknown tool"):
        log.dispatch("delete_everything", {})


DRAFT = IntakeBriefDraft(
    title="Attention",
    summary="A treatment.",
    audience_profile="Curious beginners",
    learning_objectives=["Explain self-attention"],
    key_concepts=[{"name": "Self-attention", "importance": "core"}],
    prerequisites=[],
    scope_in=["The core idea"],
    scope_out=["Training details"],
    open_questions=[],
)


class FakeResponses:
    """Answers with a brief and no tool calls, one draft per call."""

    def __init__(self, drafts):
        self.drafts = list(drafts)
        self.calls = 0

    async def parse(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(usage=None, output=[], output_parsed=self.drafts.pop(0))


def intake_with(monkeypatch, drafts, reflection: str | None):
    department = ModelIntake.__new__(ModelIntake)
    department.model = "test-model"
    department.store = SimpleNamespace(get=lambda key: _bytes())
    department.client = SimpleNamespace(responses=FakeResponses(drafts))
    department.last_usage = None
    monkeypatch.setattr(intake.SKILLS, "system", lambda: "system")
    monkeypatch.setattr(intake, "build_instructions", lambda intent, count: "instructions")
    monkeypatch.setattr(intake.SKILLS, "reflection", lambda: reflection)
    return department


async def _bytes() -> bytes:
    # Long enough to be a document (topic mode starts under TOPIC_SOURCE_LIMIT
    # characters): these tests exercise the full grounding + reflection path.
    return b"source text " * 60


SOURCE = SimpleNamespace(
    object_key="k", filename="attention.pdf", media_type="text/plain", size_bytes=720, sha256="ab"
)

TOPIC_SOURCE = SimpleNamespace(
    object_key="k", filename="topic.txt", media_type="text/plain", size_bytes=11, sha256="ab"
)


async def test_topic_source_skips_grounding_and_reflection(monkeypatch):
    # A typed topic is not a document: one call, no tool loop, no reflection —
    # even when a reflection prompt exists.
    department = intake_with(monkeypatch, [DRAFT], reflection="revise")
    async def _tiny() -> bytes:
        return b"Explain how DNS works"
    department.store = SimpleNamespace(get=lambda key: _tiny())
    brief = await department.generate(INTENT, [TOPIC_SOURCE])
    assert department.client.responses.calls == 1
    assert brief.source_findings["reflection"] == {"ran": False}


async def test_no_reflection_file_publishes_the_first_draft(monkeypatch):
    department = intake_with(monkeypatch, [DRAFT], reflection=None)
    brief = await department.generate(INTENT, [SOURCE])
    assert department.client.responses.calls == 1
    assert brief.source_findings["reflection"] == {"ran": False}


async def test_reflection_turn_replaces_the_draft(monkeypatch):
    revised = DRAFT.model_copy(update={"summary": "A sharper treatment."})
    department = intake_with(monkeypatch, [DRAFT, revised], reflection="reconsider")
    brief = await department.generate(INTENT, [SOURCE])
    assert department.client.responses.calls == 2
    assert brief.summary == "A sharper treatment."
    # Naming the field is the point: a revision that rewrote the summary and one
    # that quietly widened scope_out are not the same event.
    assert brief.source_findings["reflection"]["changed_fields"] == ["summary"]


async def test_reflection_that_changes_nothing_says_so(monkeypatch):
    department = intake_with(monkeypatch, [DRAFT, DRAFT.model_copy()], reflection="reconsider")
    brief = await department.generate(INTENT, [SOURCE])
    assert brief.source_findings["reflection"]["ran"] is True
    assert brief.source_findings["reflection"]["changed_fields"] == []


def test_openai_intake_requires_a_key(tmp_path):
    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build_intake(Settings(intake="openai", openai_api_key=None, local_object_root=tmp_path))
