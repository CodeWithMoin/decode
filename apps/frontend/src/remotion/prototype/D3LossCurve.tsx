import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { scaleLinear } from "d3-scale";
import { line as d3line, curveNatural } from "d3-shape";

const W = 1920, H = 1080;
const M = { top: 200, right: 220, bottom: 180, left: 220 };
const INK = "#F4F7FB", SUPPORT = "#AAB6C8", ACCENT = "#59D0FF", GRID = "#2A3346";
const MIN_X = 0.62;
const loss = (x: number) => 0.15 + 3.1 * (x - MIN_X) * (x - MIN_X);

export function D3LossCurve() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const x = scaleLinear().domain([0, 1]).range([M.left, W - M.right]);
  const y = scaleLinear().domain([0, 2.2]).range([H - M.bottom, M.top]);
  const samples = Array.from({ length: 120 }, (_, i) => { const xi = i / 119; return [xi, loss(xi)] as [number, number]; });
  const path = d3line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1])).curve(curveNatural)(samples)!;
  const startX = 0.08;
  const curX = startX + (MIN_X - startX) * (1 - Math.pow(1 - t, 2));
  const curY = loss(curX), px = x(curX), py = y(curY);
  const slope = 6.2 * (curX - MIN_X), dxData = 0.06;
  const ty1 = y(loss(curX) - slope * dxData), ty2 = y(loss(curX) + slope * dxData);
  const tx1 = x(curX - dxData), tx2 = x(curX + dxData);
  const yTicks = [0, 0.5, 1.0, 1.5, 2.0];
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B", fontFamily: "Space Grotesk, Inter, sans-serif" }}>
      <div style={{ position: "absolute", left: M.left, top: 96 }}>
        <div style={{ color: ACCENT, fontSize: 26, letterSpacing: 4, fontWeight: 700 }}>GRADIENT DESCENT</div>
        <div style={{ color: INK, fontSize: 52, fontWeight: 700, marginTop: 8 }}>Loss as a function of the parameter</div>
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {yTicks.map((v) => (<line key={v} x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />))}
        <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke={SUPPORT} strokeWidth={2} />
        <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke={SUPPORT} strokeWidth={2} />
        <path d={path} fill="none" stroke={ACCENT} strokeWidth={5} strokeLinecap="round" />
        <line x1={x(MIN_X)} x2={x(MIN_X)} y1={y(loss(MIN_X))} y2={H - M.bottom} stroke={GRID} strokeWidth={2} strokeDasharray="6 8" />
        <line x1={tx1} x2={tx2} y1={ty1} y2={ty2} stroke="#F2CE72" strokeWidth={4} strokeLinecap="round" />
        <line x1={px} x2={px} y1={py} y2={H - M.bottom} stroke={ACCENT} strokeWidth={2} strokeDasharray="4 8" opacity={0.6} />
        <circle cx={px} cy={py} r={22} fill={ACCENT} opacity={0.18} />
        <circle cx={px} cy={py} r={11} fill={ACCENT} />
      </svg>
      <div style={{ position: "absolute", left: M.left - 150, top: M.top - 10, color: SUPPORT, fontSize: 28 }}>loss</div>
      <div style={{ position: "absolute", left: W - M.right + 20, top: H - M.bottom - 18, color: SUPPORT, fontSize: 28 }}>θ</div>
      <div style={{ position: "absolute", left: x(MIN_X) - 40, top: H - M.bottom + 20, color: SUPPORT, fontSize: 26 }}>minimum</div>
      <div style={{ position: "absolute", left: Math.min(W - 360, px + 28), top: py - 70, color: INK, fontSize: 30, fontWeight: 700 }}>loss = {curY.toFixed(2)}</div>
    </AbsoluteFill>
  );
}
export const D3_LOSS_DURATION = 24 * 6;
