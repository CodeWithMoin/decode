"""Load the generated component contract and render it for the prompt.

component_manifest.json is emitted from the TypeScript source of truth by
`apps/frontend/scripts/gen-component-manifest.ts` (compiler API, not regex) and
kept in sync by tests/test_component_manifest.py. It is the authoritative list of
every component's props — name, required/optional, resolved type, allowed literal
values. The prompt renders signatures FROM this so a prop can't live only in a
hand-written docstring and drift (as `Label reveal?` did). Later it also backs
generated-scene prop validation.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_MANIFEST_PATH = Path(__file__).with_name("component_manifest.json")


@lru_cache(maxsize=1)
def load_manifest() -> dict[str, Any]:
    return json.loads(_MANIFEST_PATH.read_text())


def components() -> dict[str, Any]:
    return load_manifest()["components"]


def _prop_token(prop: dict[str, Any]) -> str:
    """`text`, `size`, `region?`, or `region?:"top"|"bottom"|…` for enums."""
    name = prop["name"]
    mark = "?" if prop["optional"] else ""
    values = prop.get("values")
    if values:
        rendered = "|".join(json.dumps(v) for v in values)
        return f"{name}{mark}:{rendered}"
    return f"{name}{mark}"


def signature(name: str) -> str | None:
    comp = components().get(name)
    if comp is None:
        return None
    props = " ".join(_prop_token(p) for p in comp["props"])
    return f"<{name}{' ' + props if props else ''} />"


def prop_contract_block() -> str:
    """One authoritative line per component, generated from the code. Enums list
    their allowed literals inline; `props` marked `?` are optional. This is the
    part of the prompt guaranteed to match the components."""
    lines = [signature(name) for name in sorted(components())]
    return "\n".join(f"- {line}" for line in lines if line)
