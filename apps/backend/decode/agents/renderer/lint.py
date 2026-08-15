"""Composition-validity gate: the real HyperFrames linter, shelled out to.

VISUALIZER-TO-HYPERFRAMES §6 chose (a): reuse the authoritative `hyperframes
lint` (static, no browser) rather than maintain a drifting Python copy of its
determinism rules. This mirrors the provider-boundary pattern — the CLI is a
boundary Decode owns a port to, not a framework it absorbs.

This is the **validity** boundary (a well-formed, deterministic composition). It
is NOT the **execution-security** boundary — whether generated HTML is safe to
*run* is a sandboxed render environment (§4), a separate concern this does not
address. `ran=False` means the linter could not run (offline / not installed);
the caller decides whether an un-gated composition may proceed.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from pydantic import BaseModel

# A HyperFrames project is a dir with an index.html; the config file makes the
# linter treat the temp dir as a project. The schema URL is documentation only.
_HYPERFRAMES_JSON = '{"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json"}\n'


class LintFinding(BaseModel):
    code: str = ""
    severity: str = ""
    message: str = ""


class LintResult(BaseModel):
    ok: bool
    ran: bool  # False when the CLI could not run at all (offline / not installed)
    error_count: int = 0
    findings: list[LintFinding] = []
    detail: str = ""


def lint_composition(html: str, *, timeout_s: float = 90) -> LintResult:
    """Lint one composition's HTML with `hyperframes lint --json`.

    Writes the HTML to a throwaway project and runs the CLI over it. Warnings do
    not fail `ok` — HyperFrames reserves `ok` for error-level findings — so a
    caller that wants zero findings checks `findings`.
    """
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / "index.html").write_text(html)
        (project / "hyperframes.json").write_text(_HYPERFRAMES_JSON)
        try:
            proc = subprocess.run(
                ["npx", "hyperframes", "lint", "--json", str(project)],
                capture_output=True,
                text=True,
                timeout=timeout_s,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            return LintResult(ok=False, ran=False, detail=str(exc))

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return LintResult(ok=False, ran=False, detail=(proc.stderr or proc.stdout)[:500])

    return LintResult(
        ok=bool(data.get("ok")),
        ran=True,
        error_count=int(data.get("errorCount", 0)),
        findings=[
            LintFinding(
                code=str(item.get("code", "")),
                severity=str(item.get("severity", "")),
                message=str(item.get("message", "")),
            )
            for item in data.get("findings", [])
        ],
    )
