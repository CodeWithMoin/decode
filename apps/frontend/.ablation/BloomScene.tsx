import React from "react";
import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";

// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL (real code). The lit cells are DERIVED by running this, not typed.
// This is correctness-by-derivation: whatever the hashes compute is what shows.
// ─────────────────────────────────────────────────────────────────────────────
const M = 10;
function hash(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) + str.charCodeAt(i)) >>> 0;
  return h % M;
}
function derive(item: string): number[] {
  return [1, 2, 3].map((s) => hash(item, s * 0x9e3779b1));
}
const GEEKS = derive("geeks"); // ← the trace: three indices, computed
const LIT = Array.from(new Set(GEEKS)); // deduped for the "on" set

// layout (1920×1080): 10 cells, centered
const CW = 110, GAP = 20, N = 10;
const START_X = (1920 - (N * CW + (N - 1) * GAP)) / 2; // 320
const cx = (i: number) => START_X + i * (CW + GAP) + CW / 2; // 375 + i*130
const ROW_TOP = 520;

const SURFACE = "#232323", EDGE = "#484848", AMBER = "#F2A47B", INK = "#F3F0EA", DIM = "#98A0B3";

export const BloomScene: React.FC = () => {
  const f = useCurrentFrame();

  const titleO = interpolate(f, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const itemO = interpolate(f, [22, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#0B0B0B", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* title */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center",
        fontSize: 52, fontWeight: 800, color: INK, opacity: titleO }}>
        Add “geeks” — set the bits it hashes to
      </div>

      {/* item chip */}
      <div style={{ position: "absolute", left: 830, top: 210, width: 260, textAlign: "center",
        background: SURFACE, border: `1px solid ${EDGE}`, borderRadius: 16, padding: "16px 0",
        fontSize: 42, fontWeight: 800, color: INK, opacity: itemO }}>geeks</div>

      {/* arrows: item → each hashed cell (drawn) */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }} fill="none">
        {GEEKS.map((idx, k) => {
          const draw = interpolate(f, [40 + k * 5, 62 + k * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const d = `M960 300 C 960 430 ${cx(idx)} 430 ${cx(idx)} 508`;
          return <path key={k} d={d} stroke={AMBER} strokeWidth={4} strokeLinecap="round"
            strokeDasharray={800} strokeDashoffset={800 * (1 - draw)} />;
        })}
      </svg>

      {/* the bit row: 10 cells; lit ones fill amber when their bit is set */}
      {Array.from({ length: N }).map((_, i) => {
        const cellO = interpolate(f, [10 + i * 2, 22 + i * 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const lit = LIT.includes(i);
        const t = lit ? interpolate(f, [66, 82], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
        const bg = interpolateColors(t, [0, 1], [SURFACE, AMBER]);
        const border = interpolateColors(t, [0, 1], [EDGE, AMBER]);
        return (
          <div key={i}>
            <div style={{ position: "absolute", left: cx(i) - CW / 2, top: ROW_TOP, width: CW, height: CW,
              borderRadius: 16, background: bg, border: `1px solid ${border}`, opacity: cellO }} />
            <div style={{ position: "absolute", left: cx(i) - CW / 2, top: ROW_TOP + CW + 14, width: CW,
              textAlign: "center", fontSize: 22, fontWeight: 700, color: DIM, opacity: cellO }}>{i}</div>
          </div>
        );
      })}

      {/* caption: the derived truth, shown honestly */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 760, textAlign: "center",
        fontSize: 28, fontWeight: 700, color: INK, opacity: itemO }}>
        geeks → hashes to {GEEKS.join(", ")}
      </div>
    </AbsoluteFill>
  );
};
