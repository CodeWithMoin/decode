"""Top-down dial-in harness — run the reasoning chain on a real source and dump
every artifact so we can inspect and tighten each agent's contract, in order.

    cd apps/backend && uv run python scripts/dial_in.py

Runs Producer (Intake) -> Director (Architect) -> Writer (Author) on real
providers. Each stage is fed the PREVIOUS stage's real output, so we dial in
quality top-down (a stage can only be as good as its input). No UI, no pipeline.

Needs DECODE_INTAKE / DECODE_ARCHITECT / DECODE_AUTHOR = openai (or an
OpenAI-compatible endpoint via DECODE_OPENAI_BASE_URL, e.g. DeepSeek).
"""

import asyncio
import uuid
from pathlib import Path
from types import SimpleNamespace

from decode.agents.registry import architect as build_architect
from decode.agents.registry import author as build_author
from decode.agents.registry import intake as build_intake
from decode.agents.visual_director import build as build_visual_director
from decode.config import get_settings
from decode.providers.storage import object_store
from decode.schemas import ProductionIntent, Script, TeachingPlan

# A small, real, teachable topic with an actual mechanism to explain.
SOURCE = """
A Bloom filter is a space-efficient probabilistic data structure that answers
one question: "have I possibly seen this item before?" It can say "definitely
not" or "probably yes", but never gives a false negative.

It is a bit array of size m, all zeros to start, plus k independent hash
functions. To add an item, hash it with all k functions, take each result
modulo m, and set those k bits to 1. To test membership, hash the item the same
way and check those k bits: if any is 0, the item was definitely never added;
if all are 1, it was probably added — "probably" because another set of items
could have set those same bits (a false positive).

The false-positive rate rises as the filter fills. You trade memory for
accuracy: more bits and well-chosen k push the rate down. Bloom filters shine
where a definite-no is cheap and valuable — a database skipping a disk read for
a key it has never seen, a web cache avoiding a lookup, a crawler skipping a URL
it has already visited. You cannot delete from a standard Bloom filter, because
clearing a bit might unset it for another item that shares it.
""".strip()

INTENT = ProductionIntent(
    audience="Curious developers new to data structures",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
)


async def _one_chunk(data: bytes):
    yield data


def _dump(name: str, artifact) -> None:
    text = artifact.model_dump_json(indent=2)
    path = f"dial-in-{name}.json"
    with open(path, "w") as handle:
        handle.write(text)
    print(f"\n===== {name.upper()}  (full JSON saved to apps/backend/{path}) =====")
    print(text if len(text) < 4000 else text[:4000] + "\n… (truncated; see the file)")


async def main() -> None:
    settings = get_settings()
    print(
        f"providers: intake={settings.intake} architect={settings.architect} "
        f"author={settings.author} | model={settings.openai_model} | "
        f"endpoint={settings.openai_base_url or 'openai-default'}"
    )
    for provider in (settings.intake, settings.architect, settings.author):
        if provider != "openai":
            print(f"!! provider still '{provider}' — set intake/architect/author to openai in .env")
            return

    # Reuse a cached plan + script so we can iterate on the Visual Director for one
    # model call instead of four. Delete dial-in-plan.json / dial-in-script.json to
    # regenerate the reasoning chain from scratch.
    cached_plan, cached_script = Path("dial-in-plan.json"), Path("dial-in-script.json")
    if cached_plan.exists() and cached_script.exists():
        print("\nReusing cached plan + script (delete dial-in-plan/script.json to regenerate).")
        plan = TeachingPlan.model_validate_json(cached_plan.read_text())
        script = Script.model_validate_json(cached_script.read_text())
    else:
        store = object_store(settings)
        key = f"dial-in/{uuid.uuid4().hex}.txt"
        size, _, sha = await store.put(key, _one_chunk(SOURCE.encode()), 10_000_000)
        source = SimpleNamespace(
            object_key=key,
            media_type="text/plain",
            filename="bloom-filters.txt",
            size_bytes=size,
            sha256=sha,
        )
        print("\n[1/4] Producer (Intake) — reading the source into a brief…")
        brief = await build_intake(settings).generate(INTENT, [source])
        _dump("brief", brief)

        print("\n[2/4] Director (Architect) — structuring the teaching plan…")
        plan = await build_architect(settings).generate(INTENT, brief)
        _dump("plan", plan)

        print("\n[3/4] Writer (Author) — writing the narration…")
        script = await build_author(settings).generate(INTENT, plan)
        _dump("script", script)

    print("\n[4/4] Visual Director — directing the storyboard (what each beat shows + moves)…")
    storyboard = await build_visual_director(settings).generate(INTENT, plan, script)
    _dump("storyboard", storyboard)

    print("\nDone. Inspect the four dial-in-*.json files; the storyboard is the new one.")


asyncio.run(main())
