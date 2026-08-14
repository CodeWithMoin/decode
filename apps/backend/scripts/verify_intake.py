"""Run the real Intake department against a local file and print what it produced.

The department cannot be checked by booting the app: skills load lazily, the tool
loop only runs against a live model, and a wrong model name or an unwritten skill
file fails on the first generation — which in production is a creator watching a
job die. This exercises the whole path with no Postgres, Redis or worker.

    python -m scripts.verify_intake path/to/source.pdf

Costs a real API call. Two if reflection.md is written.
"""

import asyncio
import mimetypes
import sys
import traceback
from pathlib import Path

from decode.config import get_settings
from decode.departments import SourceInput
from decode.departments.registry import intake as build_intake
from decode.providers.storage import object_store
from decode.schemas import ProductionIntent

# ponytail: one hardcoded intent. Add flags when a second shape is actually needed.
INTENT = ProductionIntent(
    audience="Curious beginners with no machine learning background",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
    creative_brief=None,
)


def show(label: str, items: list) -> None:
    print(f"\n{label}")
    for item in items:
        print(f"  - {item}")


async def verify(path: Path) -> None:
    settings = get_settings()
    print(f"intake    = {settings.intake}")
    print(f"model    = {settings.openai_model}")
    print(f"store    = {settings.object_store}")
    print(f"source   = {path.name} ({path.stat().st_size} bytes)")

    store = object_store(settings)
    raw = path.read_bytes()

    async def chunks():
        yield raw

    key = f"verification/intake/{path.name}"
    size, key, digest = await store.put(key, chunks(), settings.max_source_bytes)

    source = SourceInput(
        object_key=key,
        filename=path.name,
        media_type=mimetypes.guess_type(path.name)[0] or "text/plain",
        size_bytes=size,
        sha256=digest,
    )

    department = build_intake(settings)
    print(f"identifier = {department.identifier}\n\ngenerating…")
    brief = await department.generate(INTENT, [source])

    findings = brief.source_findings
    print(f"\n=== {brief.title} ===")
    print(f"\n{brief.summary}")
    print(f"\nWho this is for: {brief.audience_profile}")
    show("Learning objectives", brief.learning_objectives)
    show("Key ideas", [f"{c.name} [{c.importance}]" for c in brief.key_concepts])
    show("Prerequisites", brief.prerequisites)
    show("What to include", brief.scope_in)
    show("What to leave out", brief.scope_out)
    show("Questions to resolve", brief.open_questions or ["(none)"])
    show(
        f"Findings ({len(findings['findings'])})",
        [
            f"[{f['shapes']}] {f['claim']}  ({f['source_filename']}, {f['locator']})"
            for f in findings["findings"]
        ],
    )

    usage = getattr(department, "last_usage", None)
    print(f"\nfixture    = {findings['fixture']}")
    print(f"reflection = {findings['reflection']}")
    if usage:
        print(
            f"usage      = {usage.turns} turns, {usage.input_tokens} in / {usage.output_tokens} out"
        )

    await store.delete(key)
    print("\nintake=passed")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    try:
        asyncio.run(verify(Path(sys.argv[1])))
    except Exception:
        traceback.print_exc()
        print("intake=failed")
        raise SystemExit(1) from None
