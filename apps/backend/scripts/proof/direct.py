"""The direction loop: hand the agent a scene's OWN code + a human instruction, it
patches that code in place. Proves editability — the human directs, the model edits
its f(frame) source, nothing else changes.

    cd apps/backend && uv run python scripts/proof/direct.py
"""

import asyncio
import re
from pathlib import Path

from openai import AsyncOpenAI

from decode.config import get_settings

TARGET = Path(
    "/Users/moinuddinshaik/Downloads/decode/apps/frontend/.ablation/proof/arc/scenes/QueryNo.tsx"
)

# The human's direction — human-level. No pixels: use the shared geometry kit, which
# owns layout so cells cannot overlap and arrows land exactly.
DIRECTION = (
    "Rewrite this scene to get ALL geometry from the shared kit instead of computing any "
    "coordinates yourself. Add `import { CELL, ROW_TOP, rowCenters, Wire } from \"../kit\";` "
    "Compute `const centers = rowCenters(TRACE.m);` once. Render cell i as an absolutely "
    "positioned box at `left: centers[i] - CELL.w / 2, top: ROW_TOP, width: CELL.w, height: "
    "CELL.h` — never your own width/gap/position math, so the cells cannot overlap. Put each "
    "index label centered under its cell using the same `centers[i]`. Draw every arrow with the "
    "kit's `<Wire x1={chipCenterX} y1={chipBottomY} x2={centers[idx]} y2={ROW_TOP} progress={p} "
    "/>` so it lands exactly on the target cell's top. Keep everything else exactly as it is — "
    "the TRACE constant and its binding, the lit-cell logic (a cell is accent iff "
    "TRACE.bits[i]===1), the ring on the 0-cell that TRACE.query hits, the verdict, the caption, "
    "the reveal timing. Return the full corrected module."
)

SYSTEM = (
    "You are Decode's Scene Author making a targeted edit to an existing scene. You output "
    "only the full corrected TypeScript/TSX module — no prose, no markdown. Change only what "
    "the direction asks; preserve everything else, especially the TRACE constant and bindings."
)


async def main() -> None:
    s = get_settings()
    current = TARGET.read_text()
    prompt = (
        "Here is the current scene module:\n\n```tsx\n"
        + current
        + "\n```\n\n## Direction\n"
        + DIRECTION
        + "\n\nOutput only the full corrected .tsx module."
    )
    client = AsyncOpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url)
    print(f"model={s.openai_model} — applying direction to {TARGET.name} ({len(current)} chars)…")
    resp = await client.responses.create(
        model=s.openai_model, instructions=SYSTEM, input=prompt, reasoning={"effort": "medium"}
    )
    code = resp.output_text.strip()
    code = re.sub(r"^```[a-zA-Z]*\n", "", code)
    code = re.sub(r"\n```$", "", code).strip()

    # Guard: the edit must preserve the trace binding (a direction can't be allowed to
    # silently drop the facts).
    keep = {
        "TRACE preserved": "const TRACE" in code,
        "still binds bits": "TRACE.bits" in code,
        "still binds query": "TRACE.query" in code,
        "export intact": "export const QueryNoScene" in code,
    }
    TARGET.write_text(code + "\n")
    print(f"wrote {len(code)} chars (was {len(current)})")
    for name, ok in keep.items():
        print(f"  [{'OK' if ok else 'XX'}] {name}")
    print("\nRe-render:  cd apps/frontend && npx tsx .ablation/proof/arc/render.ts")


asyncio.run(main())
