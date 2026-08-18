import React from "react";

// Deterministic geometry. The scene NEVER computes a coordinate — it asks the kit.
// This is the layer the LLM kept getting wrong (arrows into void, overlapping cells);
// here it is correct by construction, so a row of cells can never overlap.

export const CANVAS = { w: 1920, h: 1080 };
export const CELL = { w: 120, h: 120, gap: 24 };
export const ROW_TOP = 470;

/** Centre-x of each of `m` cells, laid out non-overlapping and centered on the canvas. */
export function rowCenters(m: number): number[] {
  const rowW = m * CELL.w + (m - 1) * CELL.gap;
  const startX = (CANVAS.w - rowW) / 2;
  return Array.from({ length: m }, (_, i) => startX + i * (CELL.w + CELL.gap) + CELL.w / 2);
}

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Renders the whole bit row — non-overlapping BY CONSTRUCTION. The scene passes data;
 * it never writes a cell's geometry. `bits` sets lit state, `ring` marks missed cells. */
export const CellRow: React.FC<{
  bits: readonly number[];
  ring?: readonly number[];
  showIndex?: boolean;
}> = ({ bits, ring = [], showIndex = true }) => {
  const centers = rowCenters(bits.length);
  return (
    <>
      {centers.map((cx, i) => {
        const lit = bits[i] === 1;
        const ringed = ring.includes(i);
        const edge = ringed ? "#F3F0EA" : lit ? "#F2A47B" : "#484848";
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: cx - CELL.w / 2, top: ROW_TOP, width: CELL.w,
              height: CELL.h, borderRadius: 16, background: lit ? "#F2A47B" : "#232323",
              border: `${ringed ? 3 : 1}px solid ${edge}` }} />
            {showIndex && (
              <div style={{ position: "absolute", left: cx - CELL.w / 2, top: ROW_TOP + CELL.h + 14,
                width: CELL.w, textAlign: "center", fontSize: 22, fontWeight: 700, color: "#98A0B3",
                fontFamily: SANS }}>{i}</div>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** An arrow from (x1,y1) to (x2,y2), drawn in by `progress` (0..1). Lands exactly on the target. */
export const Wire: React.FC<{
  x1: number; y1: number; x2: number; y2: number; progress: number; color?: string;
}> = ({ x1, y1, x2, y2, progress, color = "#F2A47B" }) => {
  const my = (y1 + y2) / 2;
  const d = `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  const len = 1400;
  return (
    <path d={d} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round"
      strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
  );
};
