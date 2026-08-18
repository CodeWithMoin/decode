"""The direction loop as an endpoint: hand the agent a scene's OWN f(frame) source
plus a human instruction, it patches that source in place and returns it. This is
`scripts/proof/direct.py` made a surface — the human directs, the model edits its own
code, the facts stay locked.

Stateless by design: the direct workspace is a single scene + a text box, not a DB
project yet. Source in, patched source out.

The one invariant: a direction may change presentation but never the locked facts.
Those live in the scene's `const TRACE = {...} as const;` literal (correctness-by-
derivation — the diagram is a projection of a tested trace). We extract that literal
from the input and require it back verbatim in the output; a direction that altered it
is rejected, not silently applied.
"""

from __future__ import annotations

import re

from fastapi import APIRouter
from openai import AsyncOpenAI
from pydantic import BaseModel

from .config import get_settings
from .problems import AppProblem

router = APIRouter(prefix="/direct", tags=["direct"])

SYSTEM = (
    "You are Decode's Scene Author making a targeted edit to an existing scene. You "
    "output only the full corrected TypeScript/TSX module — no prose, no markdown. Change "
    "only what the direction asks; preserve everything else, especially any `const TRACE` "
    "constant and its bindings (those are locked facts derived from a tested model)."
)

# The locked-facts literal: `const TRACE = <anything> as const;` (non-greedy, spans lines).
_TRACE = re.compile(r"const\s+TRACE\s*=\s*.*?as\s+const\s*;", re.DOTALL)
_FENCE_OPEN = re.compile(r"^```[a-zA-Z]*\n")
_FENCE_CLOSE = re.compile(r"\n```$")


class DirectRequest(BaseModel):
    source: str
    direction: str


class DirectResponse(BaseModel):
    source: str


def _normalize(literal: str) -> str:
    """Whitespace-insensitive compare — the model may reflow the constant while keeping
    every fact identical, and reflowing is not altering."""
    return re.sub(r"\s+", "", literal)


def facts_preserved(original_source: str, edited_source: str) -> bool:
    """True when the edit kept the locked facts. If the input never locked a TRACE there
    is nothing to preserve; if it did, the same literal (whitespace aside) must be back."""
    original = _TRACE.search(original_source)
    if original is None:
        return True
    edited = _TRACE.search(edited_source)
    return edited is not None and _normalize(edited.group()) == _normalize(original.group())


@router.post("", response_model=DirectResponse)
async def direct(req: DirectRequest) -> DirectResponse:
    settings = get_settings()
    if not settings.openai_api_key:
        raise AppProblem(
            code="not_configured",
            status=503,
            detail="Scene authoring is not configured (no model key).",
        )

    prompt = (
        "Here is the current scene module:\n\n```tsx\n"
        + req.source
        + "\n```\n\n## Direction\n"
        + req.direction
        + "\n\nOutput only the full corrected .tsx module."
    )
    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    resp = await client.responses.create(
        model=settings.openai_model,
        instructions=SYSTEM,
        input=prompt,
        reasoning={"effort": "medium"},
    )
    code = resp.output_text.strip()
    code = _FENCE_OPEN.sub("", code)
    code = _FENCE_CLOSE.sub("", code).strip()

    # Facts must survive the edit. Presentation is free; the trace is not.
    if not facts_preserved(req.source, code):
        raise AppProblem(
            code="facts_altered",
            status=422,
            detail="That direction would change the scene's locked facts, so it was not "
            "applied. Directions can change how the scene looks, not what it shows.",
        )

    return DirectResponse(source=code + "\n")


if __name__ == "__main__":
    # Self-check: the fact guard, no model call.
    src = 'const TRACE = {\n  m: 8,\n  bits: [1, 0, 1],\n} as const;\nreturn null;'
    reflowed = 'const TRACE = { m: 8, bits: [1, 0, 1], } as const;\n// restyled\nreturn null;'
    tampered = 'const TRACE = { m: 8, bits: [1, 1, 1] } as const;\nreturn null;'
    dropped = 'return null;'
    assert facts_preserved(src, src)
    assert facts_preserved(src, reflowed), "whitespace reflow must count as preserved"
    assert not facts_preserved(src, tampered), "changing a bit must be rejected"
    assert not facts_preserved(src, dropped), "dropping TRACE must be rejected"
    assert facts_preserved(dropped, dropped), "no TRACE to lock → nothing to preserve"
    print("facts_preserved self-check OK")
