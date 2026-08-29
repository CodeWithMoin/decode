"""Drift guard: the committed component manifest must equal what the TypeScript
generator emits from the live component source.

The manifest (decode/agents/renderer/component_manifest.json) is the AI-facing
component contract — prop names, required/optional, resolved type, allowed literal
values — derived from taste.tsx / animation-api.tsx via the TS compiler API. If a
component's props change and the manifest isn't regenerated, the prompt signatures
and prop validation would silently drift. This test regenerates into a temp file
and fails on any difference, pointing at the fix.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

RENDERER = Path(__file__).resolve().parents[1] / "decode" / "agents" / "renderer"
COMMITTED = RENDERER / "component_manifest.json"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
GENERATOR = FRONTEND / "scripts" / "gen-component-manifest.ts"


def test_component_manifest_matches_source() -> None:
    assert COMMITTED.exists(), "component_manifest.json is missing — run the generator"
    if shutil.which("npx") is None:
        pytest.skip("npx unavailable; manifest drift check runs where the frontend toolchain is present")

    with tempfile.NamedTemporaryFile(suffix=".json") as tmp:
        result = subprocess.run(
            ["npx", "tsx", str(GENERATOR)],
            cwd=FRONTEND,
            env={"MANIFEST_OUT": tmp.name, "PATH": __import__("os").environ["PATH"]},
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, f"generator failed:\n{result.stderr}"
        regenerated = Path(tmp.name).read_text()

    assert regenerated == COMMITTED.read_text(), (
        "Component manifest is stale. A component's props changed but the committed "
        "contract wasn't regenerated.\n"
        "Fix: cd apps/frontend && npx tsx scripts/gen-component-manifest.ts"
    )
