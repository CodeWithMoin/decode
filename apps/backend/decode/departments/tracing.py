"""Observability for the parts of a department run we actually debug.

Deliberately not blanket instrumentation. A trace earns its place by answering
a question we ask when a brief comes out wrong, and there are only four:

    Which direction produced this?   the intent, on the root span
    What did the model see and say?  one span per conversation turn
    What did it claim, and from where?  every record_finding call
    Did reflection change anything?   the changed fields, named

Everything else stays out. The base64 PDF is megabytes of noise that would
dominate every trace while telling us nothing we cannot read from the file
itself. Storage reads, the deterministic evaluator, and the job machinery are
already better described by Postgres, which is canonical for them.

Traces are an operations tool, never a data source. Nothing here flows back
into an artifact, a receipt, or the UI — `decode-backend-foundation.md` §3.7
keeps model reasoning out of the domain, and reading a trace into a rationale
would route around that rather than change it.

Unconfigured is the normal case. Tests, the fixture departments and a plain
`make dev` all run without Langfuse, so every helper degrades to a no-op rather
than raising or buffering.
"""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any, Literal

from ..config import Settings

_enabled = False
ObservationType = Literal["span", "agent", "tool", "chain", "retriever", "evaluator", "guardrail"]


def configure(settings: Settings) -> bool:
    """Wire up Langfuse if it is configured. Returns whether tracing is on.

    Called once per process at worker start rather than per run: the SDK owns a
    background exporter thread, and building one per generation would leak them.
    """
    global _enabled
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        _enabled = False
        return False

    from langfuse import Langfuse

    Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
        environment=settings.environment,
        mask=_mask,
    )
    _enabled = True
    install_openai_tracing()
    return True


def install_openai_tracing() -> None:
    """Patch the OpenAI SDK to report each call, if tracing is on.

    `langfuse.openai` exports the same `AsyncOpenAI` object as `openai` — it
    patches the class in place rather than subclassing — so importing the module
    is the entire effect. Departments keep constructing `openai.AsyncOpenAI`.
    """
    if _enabled:
        import langfuse.openai  # noqa: F401


def _redact(value: Any) -> Any:
    """Drop source bytes before anything leaves the process.

    A PDF arrives as a base64 data URL that can run to megabytes. Sending it
    would bloat every trace, and it is the creator's material rather than ours.
    The filename and media type stay, which is all a trace needs to say which
    source a turn was reading.

    Text sources are left intact: they are small, and seeing what the model read
    is the whole point when a finding cites the wrong place. That is a defensible
    default for a private beta over your own material and an explicit decision to
    revisit before outside creators upload anything.
    """
    if isinstance(value, dict):
        if value.get("type") == "input_file" and "file_data" in value:
            return {**value, "file_data": "<redacted: source bytes>"}
        return {key: _redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _mask(*, data: Any, **_: Any) -> Any:
    """Langfuse's mask hook, which passes `data` by keyword only."""
    return _redact(data)


@contextmanager
def span(name: str, *, as_type: ObservationType = "span", **attributes: Any):
    """A named step, or nothing at all when tracing is off.

    Yields an object with `.update(**kwargs)` either way, so callers never guard
    on whether Langfuse is configured.
    """
    if not _enabled:
        yield SimpleNamespace(update=lambda **_: None)
        return

    from langfuse import get_client

    with get_client().start_as_current_observation(
        as_type=as_type, name=name, **attributes
    ) as observation:
        yield observation


@contextmanager
def run(
    name: str,
    *,
    run_id: str,
    job_id: str,
    project_id: str,
    actor_id: str,
    input: Any,
    metadata: dict[str, Any] | None = None,
):
    """One correlated root observation for generation, tools, and evaluation."""
    if not _enabled:
        yield SimpleNamespace(update=lambda **_: None, trace_id=None, id=None)
        return

    from langfuse import get_client, propagate_attributes

    client = get_client()
    trace_id = client.create_trace_id(seed=f"decode-run:{run_id}")
    correlation = {
        "project_id": project_id,
        "job_id": job_id,
        "run_id": run_id,
        **(metadata or {}),
    }
    with propagate_attributes(
        user_id=actor_id,
        session_id=project_id,
        trace_name=name,
        tags=["decode", name],
        metadata=correlation,
    ):
        with client.start_as_current_observation(
            as_type="agent",
            name=name,
            trace_context={"trace_id": trace_id},
            input=input,
            metadata=correlation,
        ) as observation:
            yield observation


def event(name: str, **attributes: Any) -> None:
    """A point-in-time record, used for each grounding claim."""
    if not _enabled:
        return

    from langfuse import get_client

    get_client().create_event(name=name, **attributes)


def score(
    *,
    observation: Any,
    name: str,
    value: str,
    comment: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Attach a categorical quality result to the run's root observation."""
    if not _enabled or observation.trace_id is None or observation.id is None:
        return

    from langfuse import get_client

    get_client().create_score(
        name=name,
        value=value,
        data_type="CATEGORICAL",
        trace_id=observation.trace_id,
        observation_id=observation.id,
        comment=comment,
        metadata=metadata,
    )


def flush() -> None:
    """Push buffered traces.

    The worker is long-lived so the exporter would drain on its own, but a run
    that fails is exactly the one whose trace is wanted immediately rather than
    at the next flush interval.
    """
    if not _enabled:
        return

    from langfuse import get_client

    get_client().flush()
