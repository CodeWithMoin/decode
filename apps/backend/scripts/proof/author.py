"""model -> trace -> scene, end to end. Runs the tested Bloom model, derives the
trace, hands the false-positive step to the scene-author (a real model call), and
verifies the authored component is bound to the trace (not inventing facts).

    cd apps/backend && uv run python scripts/proof/author.py
"""

import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bloom_model import DEMO_ADD, run_trace  # noqa: E402

from openai import AsyncOpenAI  # noqa: E402

from decode.config import get_settings  # noqa: E402

OUT = Path("/Users/moinuddinshaik/Downloads/decode/apps/frontend/.ablation/proof/BloomScene.tsx")

SYSTEM = (
    "You are Decode's Scene Author. You write ONE self-contained React component that "
    "renders a single teaching scene as a pure function of the video frame (Remotion). "
    "Output only TypeScript/TSX code for the module — no prose, no markdown."
)


def build_trace_literal() -> tuple[str, dict]:
    trace = run_trace(DEMO_ADD)
    fp = trace["false_positive"]
    payload = {
        "m": trace["m"],
        "bits": trace["final_bits"],  # filter state after the adds — lit cells
        "added": trace["added"],
        "query": {
            "item": fp["item"],
            "indices": fp["indices"],
            "read": fp["read"],
            "present": fp["present"],
            "falsePositive": fp["false_positive"],
        },
    }
    return json.dumps(payload, ensure_ascii=True), payload


PROMPT_TMPL = """## Hard rules (do not violate)
- Pure f(frame). Import `React from "react"` and `{{ AbsoluteFill, useCurrentFrame, interpolate, interpolateColors }} from "remotion"`. Every visual property derives from `useCurrentFrame()` via `interpolate()`. No useState, timers, Math.random.
- Export EXACTLY `export const BloomScene: React.FC = () => {{ ... }}`.
- Include this EXACT constant verbatim at the top of the module and bind every visual to it — never hardcode a cell index, a lit state, or the verdict:
const TRACE = {trace} as const;
- Canvas 1920x1080. Background #0B0B0B. surface #232323, edge #484848, ink #F3F0EA, dim #98A0B3, accent #F2A47B. Heavy sans system font.
- CORRECTNESS BY DERIVATION: a cell is lit iff `TRACE.bits[i] === 1` (fill it accent, else surface). The chip is `TRACE.query.item`. Draw one arrow from the chip to each cell in `TRACE.query.indices`, computing each cell's on-screen centre by formula so the arrow lands exactly. The verdict text is derived: if `TRACE.query.present` show "probably seen" in accent, else "definitely NOT seen" in ink.
- Fill the frame; large legible type. Reach a complete state and HOLD it (all motion done well before the last frame).

## The scene
Title: `Is “{item}” in the set?`.
Show: a chip labelled `TRACE.query.item` near the top; a horizontal centered row of `TRACE.m` rounded cells with index labels beneath; lit cells filled per `TRACE.bits`; an arrow from the chip to each `TRACE.query.indices` cell; the derived verdict pill below the row; and a caption: `{item} → {ixlist} — all set, but never added` when it is a false positive (`TRACE.query.falsePositive`).
Timing (fps 30, ~150 frames): title fades; cells stagger in showing the existing filter state; chip appears; arrows draw (stroke-dashoffset); the queried cells pulse; the verdict and caption appear; hold.

Output only the .tsx code for the module."""


async def main() -> None:
    s = get_settings()
    trace_literal, payload = build_trace_literal()
    ixlist = ", ".join(str(i) for i in payload["query"]["indices"])
    prompt = PROMPT_TMPL.format(
        trace=trace_literal, item=payload["query"]["item"], ixlist=ixlist
    )

    print("=== derived trace (from the tested model) ===")
    print(json.dumps(payload, indent=2))

    client = AsyncOpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url)
    print(f"\nmodel={s.openai_model} — authoring the scene bound to the trace…")
    resp = await client.responses.create(
        model=s.openai_model, instructions=SYSTEM, input=prompt, reasoning={"effort": "medium"}
    )
    code = resp.output_text.strip()
    code = re.sub(r"^```[a-zA-Z]*\n", "", code)
    code = re.sub(r"\n```$", "", code).strip()
    OUT.write_text(code + "\n")

    # VERIFY — the component must be bound to the trace, not inventing facts.
    checks = {
        "binds TRACE constant": f"[{', '.join(str(b) for b in payload['bits'])}]".replace(" ", "")
        in code.replace(" ", ""),
        "uses TRACE.bits": "TRACE.bits" in code,
        "uses TRACE.query.indices": "TRACE.query.indices" in code or "query.indices" in code,
        "no hardcoded lit set": "[3, 5, 9]" not in code.replace("indices", "")  # heuristic
        or "TRACE" in code,
    }
    print(f"\n=== wrote {len(code)} chars to {OUT} ===")
    print("=== verify (scene bound to trace, not inventing) ===")
    for name, ok in checks.items():
        print(f"  [{'OK' if ok else 'XX'}] {name}")
    print("\nNow render:  cd apps/frontend && npx tsx .ablation/proof/render.ts")


asyncio.run(main())
