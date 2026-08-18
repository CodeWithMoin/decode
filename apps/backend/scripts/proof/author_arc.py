"""Author the full DERIVED arc: insert -> definite-no -> false-positive, every scene
bound to the one tested trace. Writes three f(frame) scene files + a Series root that
sequences them into one video.

    cd apps/backend && uv run python scripts/proof/author_arc.py
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

ARC = Path("/Users/moinuddinshaik/Downloads/decode/apps/frontend/.ablation/proof/arc")
SCENES = ARC / "scenes"

SYSTEM = (
    "You are Decode's Scene Author. You write ONE self-contained React component that "
    "renders a single teaching scene as a pure function of the video frame (Remotion). "
    "Output only TypeScript/TSX code for the module — no prose, no markdown."
)

RULES = """## Hard rules (do not violate)
- Pure f(frame). Import `React from "react"` and `{{ AbsoluteFill, useCurrentFrame, interpolate, interpolateColors }} from "remotion"`. Every visual property derives from `useCurrentFrame()` via `interpolate()`. No useState, timers, Math.random.
- Export EXACTLY `export const {name}: React.FC = () => {{ ... }}`.
- Include this EXACT constant verbatim near the top and bind every visual to it — never hardcode a cell index, a lit state, or the verdict:
const TRACE = {trace} as const;
- Canvas 1920x1080. Background #0B0B0B. surface #232323, edge #484848, ink #F3F0EA, dim #98A0B3, accent #F2A47B. Heavy sans system font.
- Compute each cell's on-screen centre by formula from its index, and draw every arrow to that exact centre so it lands precisely (never a hardcoded coordinate). Keep the whole row comfortably inside the frame with margin on both sides.
- Fill the frame; large legible type. Reach a complete state and HOLD it (all motion done well before the last frame)."""


def specs(trace: dict) -> list[dict]:
    add0 = trace["steps"][0]  # add geeks
    no = trace["definite_no"]
    fp = trace["false_positive"]
    m = trace["m"]
    return [
        {
            "name": "InsertScene",
            "file": "Insert",
            "trace": {"m": m, "item": add0["item"], "indices": add0["indices"],
                      "bits": add0["bits_after"]},
            "brief": (
                f'Insertion. Title `Add “{add0["item"]}”`. Start from a row of TRACE.m cells; '
                "a cell is lit accent iff `TRACE.bits[i] === 1`, else surface (show a small "
                "index label under each). A chip labelled `TRACE.item` sits above the row. "
                "Draw an arrow from the chip to each cell in `TRACE.indices`; those cells fill "
                "to accent as the arrows land. Caption below: `TRACE.item + \" sets bits \" + "
                "TRACE.indices.join(\", \")`."
            ),
        },
        {
            "name": "QueryNoScene",
            "file": "QueryNo",
            "trace": {"m": m, "bits": trace["final_bits"],
                      "query": {"item": no["item"], "indices": no["indices"],
                                "read": no["read"], "present": no["present"]}},
            "brief": (
                f'Membership check. Title `Is “{no["item"]}” in the set?`. Show the filled row: '
                "cell i lit accent iff `TRACE.bits[i] === 1`, else surface, with index labels. "
                "A chip `TRACE.query.item` above. Draw an arrow to each `TRACE.query.indices` "
                "cell. Because `TRACE.query.present` is false, at least one of those cells is 0 "
                "(surface) — put a bright ring on the cells whose `TRACE.bits[idx] === 0` to show "
                "the miss. Verdict pill below (ink): `definitely NOT seen`. Caption: "
                "`one bit is 0 — so it was definitely never added`."
            ),
        },
        {
            "name": "QueryFpScene",
            "file": "QueryFp",
            "trace": {"m": m, "bits": trace["final_bits"], "added": trace["added"],
                      "query": {"item": fp["item"], "indices": fp["indices"],
                                "read": fp["read"], "present": fp["present"],
                                "falsePositive": fp["false_positive"]}},
            "brief": (
                f'Membership check. Title `Is “{fp["item"]}” in the set?`. Show the filled row '
                "(cell i lit accent iff `TRACE.bits[i] === 1`), index labels. Chip "
                "`TRACE.query.item` above; arrow to each `TRACE.query.indices` cell — all land on "
                "lit cells. Verdict pill (accent): `probably seen`. Then a caption revealing the "
                "catch: `TRACE.query.item + \" → \" + TRACE.query.indices.join(\", \") + \" all "
                "set, but never added — a false positive\"`."
            ),
        },
    ]


async def author_one(client, model, spec) -> str:
    prompt = (
        RULES.format(name=spec["name"], trace=json.dumps(spec["trace"], ensure_ascii=True))
        + "\n\n## The scene\n"
        + spec["brief"]
        + "\n\nTiming (fps 30, ~150 frames): title fades; cells stagger in; chip appears; "
        "arrows draw (stroke-dashoffset); the queried/target cells resolve (fill or ring); "
        "verdict + caption appear; hold.\n\nOutput only the .tsx code for the module."
    )
    resp = await client.responses.create(
        model=model, instructions=SYSTEM, input=prompt, reasoning={"effort": "medium"}
    )
    code = resp.output_text.strip()
    code = re.sub(r"^```[a-zA-Z]*\n", "", code)
    code = re.sub(r"\n```$", "", code).strip()
    return code


def write_root() -> None:
    root = """import React from "react";
import { Composition, registerRoot, Series } from "remotion";
import { InsertScene } from "./scenes/Insert";
import { QueryNoScene } from "./scenes/QueryNo";
import { QueryFpScene } from "./scenes/QueryFp";

const Arc: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={150}><InsertScene /></Series.Sequence>
    <Series.Sequence durationInFrames={150}><QueryNoScene /></Series.Sequence>
    <Series.Sequence durationInFrames={150}><QueryFpScene /></Series.Sequence>
  </Series>
);

const Root: React.FC = () => (
  <Composition id="Arc" component={Arc} width={1920} height={1080} fps={30} durationInFrames={450} />
);

registerRoot(Root);
"""
    (ARC / "root.tsx").write_text(root)
    render = """import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
async function main() {
  const root = process.cwd();
  const entryPoint = path.join(root, ".ablation", "proof", "arc", "root.tsx");
  const serveUrl = await bundle({ entryPoint });
  const composition = await selectComposition({ serveUrl, id: "Arc", inputProps: {} });
  await renderMedia({ serveUrl, composition, codec: "h264",
    outputLocation: path.join(root, ".ablation", "proof", "arc", "arc.mp4") });
  console.log("OUT: .ablation/proof/arc/arc.mp4");
}
main().catch((e) => { console.error(e); process.exit(1); });
"""
    (ARC / "render.ts").write_text(render)


async def main() -> None:
    s = get_settings()
    SCENES.mkdir(parents=True, exist_ok=True)
    trace = run_trace(DEMO_ADD)
    print("=== derived trace ===")
    print(f"  added {trace['added']} -> bits {trace['final_bits']}")
    print(f"  definite-no: {trace['definite_no']['item']} reads {trace['definite_no']['read']}")
    print(f"  false-pos  : {trace['false_positive']['item']} -> {trace['false_positive']['indices']}")

    client = AsyncOpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url)
    for spec in specs(trace):
        print(f"\nauthoring {spec['name']} …")
        code = await author_one(client, s.openai_model, spec)
        (SCENES / f"{spec['file']}.tsx").write_text(code + "\n")
        bits = spec["trace"].get("bits", [])
        bound = f"[{','.join(map(str, bits))}]".replace(" ", "") in code.replace(" ", "")
        exp_ok = f"export const {spec['name']}" in code
        print(f"  wrote {len(code)} chars | binds TRACE bits: {'OK' if bound else 'XX'} | "
              f"export ok: {'OK' if exp_ok else 'XX'}")
    write_root()
    print("\nWrote root + render. Now:  cd apps/frontend && npx tsx .ablation/proof/arc/render.ts")


asyncio.run(main())
