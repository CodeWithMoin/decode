import sys
from contextlib import contextmanager
from types import ModuleType

import pytest

from decode.config import Settings
from decode.departments import tracing


@pytest.fixture(autouse=True)
def reset_tracing():
    tracing._enabled = False
    yield
    tracing._enabled = False


def test_tracing_is_off_without_keys(tmp_path):
    # The normal case: tests, the fixture producer and a dev loop that is not
    # working on prompts all run with no Langfuse at all.
    assert tracing.configure(Settings(local_object_root=tmp_path)) is False


def test_span_and_event_are_inert_when_off():
    # Callers never guard on whether tracing is configured, so the no-op path has
    # to support the same calls the live one does.
    with tracing.span("intake", input={"audience": "beginners"}) as observed:
        observed.update(output={"title": "Attention"})
    tracing.event(name="finding.record_finding", input={"claim": "..."})
    tracing.flush()


def test_source_bytes_never_leave_the_process():
    # A PDF arrives as a base64 data URL. It is the creator's material and it is
    # megabytes of noise; the filename is all a trace needs to identify it.
    masked = tracing._mask(
        data={
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "filename": "attention.pdf",
                    "file_data": "data:application/pdf;base64,JVBERi0xLjQK",
                },
                {"type": "input_text", "text": "Audience: curious beginners"},
            ],
        }
    )
    attached, instructions = masked["content"]
    assert attached["file_data"] == "<redacted: source bytes>"
    assert attached["filename"] == "attention.pdf"
    # Text sources stay: seeing what the model read is the point when a finding
    # cites the wrong place.
    assert instructions["text"] == "Audience: curious beginners"


def test_masking_leaves_ordinary_payloads_alone():
    payload = {"claim": "Self-attention replaces recurrence.", "locator": "page 2"}
    assert tracing._mask(data=payload) == payload


class FakeObservation:
    trace_id = "a" * 32
    id = "b" * 16

    def __init__(self):
        self.updates = []

    def update(self, **attributes):
        self.updates.append(attributes)


class FakeLangfuseClient:
    def __init__(self):
        self.observations = []
        self.events = []
        self.scores = []
        self.seeds = []

    def create_trace_id(self, *, seed):
        self.seeds.append(seed)
        return "a" * 32

    @contextmanager
    def start_as_current_observation(self, **attributes):
        observation = FakeObservation()
        self.observations.append((attributes, observation))
        yield observation

    def create_event(self, **attributes):
        self.events.append(attributes)

    def create_score(self, **attributes):
        self.scores.append(attributes)

    def flush(self):
        pass


def install_fake_langfuse(monkeypatch):
    client = FakeLangfuseClient()
    propagated = []
    module = ModuleType("langfuse")
    openai_module = ModuleType("langfuse.openai")

    def langfuse(**_kwargs):
        return client

    @contextmanager
    def propagate_attributes(**attributes):
        propagated.append(attributes)
        yield

    module.Langfuse = langfuse
    module.get_client = lambda: client
    module.propagate_attributes = propagate_attributes
    monkeypatch.setitem(sys.modules, "langfuse", module)
    monkeypatch.setitem(sys.modules, "langfuse.openai", openai_module)
    return client, propagated


def test_enabled_run_is_correlated_and_scores_the_root(monkeypatch, tmp_path):
    client, propagated = install_fake_langfuse(monkeypatch)
    settings = Settings(
        local_object_root=tmp_path,
        langfuse_public_key="pk-lf-test",
        langfuse_secret_key="sk-lf-test",
    )
    assert tracing.configure(settings) is True

    with tracing.run(
        "generate_production_brief",
        run_id="run-1",
        job_id="job-1",
        project_id="project-1",
        actor_id="creator-1",
        input={"intent": "teach attention"},
        metadata={"artifact_type": "production_brief"},
    ) as root:
        with tracing.span("production-brief-evaluation", as_type="evaluator"):
            tracing.event("finding.record_finding", input={"claim": "grounded"})
        root.update(output={"artifact_version_id": "version-1"})
        tracing.score(
            observation=root,
            name="production_brief_quality",
            value="pass",
            comment="All checks passed.",
            metadata={"artifact_version_id": "version-1"},
        )

    root_attributes, root_observation = client.observations[0]
    assert client.seeds == ["decode-run:run-1"]
    assert root_attributes["as_type"] == "agent"
    assert root_attributes["trace_context"] == {"trace_id": "a" * 32}
    assert root_attributes["metadata"]["job_id"] == "job-1"
    assert root_observation.updates == [{"output": {"artifact_version_id": "version-1"}}]
    assert client.observations[1][0]["as_type"] == "evaluator"
    assert propagated[0]["session_id"] == "project-1"
    assert propagated[0]["user_id"] == "creator-1"
    assert client.scores[0]["observation_id"] == "b" * 16
    assert client.scores[0]["value"] == "pass"
