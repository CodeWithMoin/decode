import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CANVAS, CELL, ROW_TOP, rowCenters, CellRow, Wire } from "../kit";

// Bound to the derived trace. The scene composes correct components — it writes NO geometry.
const TRACE = {
  m: 10,
  bits: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
  query: { item: "cat", indices: [1, 4, 6], read: [0, 1, 1], present: false },
} as const;

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const QueryNoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const centers = rowCenters(TRACE.m);
  const chipX = CANVAS.w / 2;
  const chipBottomY = 300;

  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const titleO = interpolate(frame, [0, 15], [0, 1], clamp);
  const chipO = interpolate(frame, [18, 30], [0, 1], clamp);
  const draw = interpolate(frame, [40, 68], [0, 1], clamp);
  const verdictO = interpolate(frame, [78, 96], [0, 1], clamp);
  const capO = interpolate(frame, [92, 110], [0, 1], clamp);

  // derived: the missed cells are the queried indices whose bit is 0
  const ring = TRACE.query.indices.filter((i) => TRACE.bits[i] === 0);

  return (
    <AbsoluteFill style={{ background: "#0B0B0B", color: "#F3F0EA", fontFamily: SANS }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 90, textAlign: "center",
        fontSize: 54, fontWeight: 800, opacity: titleO }}>Is “{TRACE.query.item}” in the set?</div>

      <div style={{ position: "absolute", left: chipX - 130, top: 210, width: 260, textAlign: "center",
        background: "#232323", border: "1px solid #484848", borderRadius: 16, padding: "16px 0",
        fontSize: 40, fontWeight: 800, opacity: chipO }}>{TRACE.query.item}</div>

      <svg width={CANVAS.w} height={CANVAS.h} style={{ position: "absolute", inset: 0 }} fill="none">
        {TRACE.query.indices.map((idx, k) => (
          <Wire key={k} x1={chipX} y1={chipBottomY} x2={centers[idx]} y2={ROW_TOP}
            progress={interpolate(draw, [0, 1], [0, 1])} color="#98A0B3" />
        ))}
      </svg>

      <CellRow bits={TRACE.bits} ring={ring} />

      <div style={{ position: "absolute", left: 510, top: ROW_TOP + CELL.h + 90, width: 900,
        textAlign: "center", borderRadius: 999, padding: "20px 0", fontSize: 34, fontWeight: 800,
        background: "#232323", border: "1px solid #484848", color: "#F3F0EA", opacity: verdictO }}>
        definitely NOT seen
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, top: ROW_TOP + CELL.h + 190,
        textAlign: "center", fontSize: 26, fontWeight: 600, color: "#98A0B3", opacity: capO }}>
        one bit is 0 — so it was definitely never added
      </div>
    </AbsoluteFill>
  );
};
