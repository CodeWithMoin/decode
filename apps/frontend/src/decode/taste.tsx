import type { CSSProperties, ReactNode } from "react";
import * as d3 from "d3";
import { useCurrentFrame, useVideoConfig } from "remotion";

/* ---------------------------------------------------------------------------
 * TASTE — the one place you drive the look.
 *
 * You are the editor. These values decide how every generated scene reads;
 * the model never picks a raw hex or radius, it composes the components below.
 * Change a number here, every scene changes.
 *
 * Direction (from /style-ref, statquest world): WHITE surface, FLAT (no
 * shadows — emphasis is outline colour and fill, never lift), ONE colour per
 * concept carried across box + arrow + label, warm rounded nodes, big type.
 * ------------------------------------------------------------------------- */

export const tokens = {
  color: {
    surface: "#ffffff", // frame background
    ink: "#1a1a1a", // primary text
    support: "#8a8a8a", // secondary text (the "Extra High" grey)
    border: "#7a7a7a", // a neutral, uncoloured node outline
  },

  /**
   * Concept colourways — each concept (an input, a path, a term) owns ONE and
   * keeps it across its node, its arrow and its label. Colour is identity, not
   * decoration. `stroke` is the outline/arrow; `fill` is the light wash when a
   * node is activated. Add or recolour freely — this is your palette.
   */
  concept: {
    blue: { stroke: "#3b7dd8", fill: "#eaf1fb" },
    orange: { stroke: "#f5a623", fill: "#fdf0d9" },
    green: { stroke: "#5fa845", fill: "#e9f4e4" },
    purple: { stroke: "#9b6a9e", fill: "#f2eaf3" },
  },

  radius: 18, // warm-casual: generous rounding
  strokeWidth: 3, // node outline thickness
  padding: "14px 18px",
  font: {
    family: "Inter, system-ui, sans-serif",
    labelSize: 22,
    labelWeight: 600,
  },
} as const;

export type Tokens = typeof tokens;
export type ConceptColor = keyof typeof tokens.concept;

// Resolve a concept colour safely: a generated scene may pass a key that is not
// in the palette ("teal", undefined). The component must never crash on a bad
// prop, so an unknown key falls back to blue rather than throwing on `.stroke`.
function cc(color: ConceptColor | string | undefined): { stroke: string; fill: string } {
  return (color != null && (tokens.concept as Record<string, { stroke: string; fill: string }>)[color]) || tokens.concept.blue;
}

type Pt = { x: number; y: number };
const r3 = (n: number) => Number(n.toFixed(3)); // quantise sqrt-derived coords
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------------------------------------------------------------------------
 * <Plot> — a data curve. d3 owns the geometry (scales + line), tokens own the
 * look, `progress` draws the curve on, and an optional `markerAt` rides a dot
 * along it (a value descending a loss curve, a point tracing a function). The
 * model composes <Plot> and never touches d3. Axis labels are composed around
 * it with <Label>, so this stays the geometry, not the copy.
 * ------------------------------------------------------------------------- */

export function Plot({
  data,
  xDomain,
  yDomain,
  color = "blue",
  progress = 1,
  markerAt,
  markerOpacity = 1,
  yAxisProgress = 1,
  xAxisProgress = 1,
  xLabel,
  yLabel,
  rect = { x: 360, y: 200, width: 1200, height: 660 },
  style,
}: {
  data: Pt[];
  xDomain: [number, number];
  yDomain: [number, number];
  color?: ConceptColor;
  /** 0->1 draws the curve on. */
  progress?: number;
  /** Axis titles, anchored to the axes by construction (no free Label to drift or
      collide). xLabel sits centred below the x-axis; yLabel runs up the y-axis. */
  xLabel?: string;
  yLabel?: string;
  /** 0->1 position along the data; places a dot on the curve. Omit for none. */
  markerAt?: number;
  /** 0->1 fades the dot in. */
  markerOpacity?: number;
  /** 0->1 draws each axis on as an arrow. Stagger them (y then x) for a clear
      one-after-the-other build. */
  yAxisProgress?: number;
  xAxisProgress?: number;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const stroke = cc(color).stroke;
  const axis = t.color.ink; // axes are black, structural — not the grey border
  const x = d3.scaleLinear().domain(xDomain).range([rect.x, rect.x + rect.width]);
  // Range is inverted: SVG y grows downward, so the domain max sits at the top.
  const y = d3.scaleLinear().domain(yDomain).range([rect.y + rect.height, rect.y]);
  const line = d3
    .line<Pt>()
    .x((d) => x(d.x))
    .y((d) => y(d.y))
    .curve(d3.curveNatural);
  const path = line(data) ?? "";
  const p = clamp01(progress);

  let marker: { cx: number; cy: number } | null = null;
  if (markerAt != null && data.length > 1) {
    const idx = clamp01(markerAt) * (data.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(data.length - 1, i0 + 1);
    const f = idx - i0;
    const px = data[i0].x + (data[i1].x - data[i0].x) * f;
    const py = data[i0].y + (data[i1].y - data[i0].y) * f;
    marker = { cx: r3(x(px)), cy: r3(y(py)) };
  }

  // Origin at bottom-left. Axes draw on as arrows growing from it — y up first,
  // then x right — from the single `axisProgress` knob.
  const ox = rect.x;
  const oy = rect.y + rect.height;
  const yAp = clamp01(yAxisProgress);
  const xAp = clamp01(xAxisProgress);
  // Axes run PAST the data by the arrowhead's own length plus a gap, so the head
  // always sits in clear space beyond the last bar / tallest value (not on top of
  // it). Derived from the head size, not a hardcoded length.
  const AX_EXT = 16 * 2 + 8; // = HL*2 + gap
  const yTip = r3(oy - (rect.height + AX_EXT) * yAp);
  const xTip = r3(ox + (rect.width + AX_EXT) * xAp);
  const AW = 3; // axis stroke
  const HL = 16; // arrowhead length
  const HW = 9; // arrowhead half-width

  return (
    <svg
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}
    >
      {/* Y axis grows up, arrowhead riding the tip. */}
      {yAp > 0.01 && (
        <>
          <line x1={ox} y1={oy} x2={ox} y2={yTip} stroke={axis} strokeWidth={AW} strokeLinecap="butt" />
          <polygon points={`${ox},${r3(yTip - 2)} ${ox - HW},${r3(yTip + HL)} ${ox + HW},${r3(yTip + HL)}`} fill={axis} />
        </>
      )}
      {/* X axis grows right, arrowhead riding the tip. */}
      {xAp > 0.01 && (
        <>
          <line x1={ox} y1={oy} x2={xTip} y2={oy} stroke={axis} strokeWidth={AW} strokeLinecap="butt" />
          <polygon points={`${r3(xTip + 2)},${oy} ${r3(xTip - HL)},${oy - HW} ${r3(xTip - HL)},${oy + HW}`} fill={axis} />
        </>
      )}
      {p > 0 && (
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={5}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${r3(p)} ${r3(1 - p + 0.0001)}`}
        />
      )}
      {marker && <circle cx={marker.cx} cy={marker.cy} r={13} fill={stroke} opacity={r3(clamp01(markerOpacity))} />}
      {/* Axis titles ride the axes — no free Label to drift into the curve. They
          fade in with their axis so the build still reads. */}
      {xLabel && (
        <text x={r3(ox + rect.width / 2)} y={r3(oy + 52)} textAnchor="middle" fontFamily={t.font.family} fontSize={30} fontWeight={600} fill={axis} opacity={r3(xAp)}>
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text x={r3(ox - 44)} y={r3(rect.y + rect.height / 2)} textAnchor="middle" fontFamily={t.font.family} fontSize={30} fontWeight={600} fill={axis} opacity={r3(yAp)} transform={`rotate(-90 ${r3(ox - 44)} ${r3(rect.y + rect.height / 2)})`}>
          {yLabel}
        </text>
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <Chart> — the quantitative-data family: bar, line, area, scatter. One
 * component, one `kind`, so every chart shares the same black-arrow axes, the
 * same concept colour, the same flat white and the same narration-timed build.
 * (Plot above is the specialised curve+marker variant, kept as-is; Chart is the
 * generaliser the taxonomy calls for.) Geometry is owned here — d3 scales, the
 * baseline, the stagger — so the model picks a `kind` and supplies data and can
 * never produce a bar below its baseline or an axis that doesn't meet the origin.
 *
 *   kind="bar"      bars: {label, value, color?}[]   grow from the baseline
 *   kind="line"     data: {x, y}[]                    draw on left→right
 *   kind="area"     data: {x, y}[]                    line + wash under it
 *   kind="scatter"  data: {x, y, color?}[]            dots pop in, staggered
 *
 * `progress` drives the data build; `xAxisProgress`/`yAxisProgress` draw the
 * axes on (stagger them before the data). Domains auto-fit the data when omitted.
 * ------------------------------------------------------------------------- */

type ChartPt = { x: number; y: number; color?: ConceptColor };
type ChartBar = { label: string; value: number; color?: ConceptColor };

export function Chart({
  kind,
  data = [],
  series = [],
  bars = [],
  groups = [],
  seriesColors,
  seriesNames,
  xDomain,
  yDomain,
  color = "blue",
  progress = 1,
  yAxisProgress = 1,
  xAxisProgress = 1,
  fill,
  markerAt,
  markerOpacity = 1,
  showValues = false,
  xLabel,
  yLabel,
  xLog = false,
  yLog = false,
  rect = { x: 360, y: 200, width: 1200, height: 640 },
  style,
}: {
  kind: "bar" | "histogram" | "line" | "area" | "scatter" | "pie";
  /** line / area / scatter data (one series). */
  data?: ChartPt[];
  /** line / area: SEVERAL series, each its own colour + optional end label (a
      train-vs-validation loss, any A-vs-B over time). Overrides `data`. */
  series?: { data: ChartPt[]; color?: ConceptColor; label?: string }[];
  /** bar data. */
  bars?: ChartBar[];
  /** GROUPED bars: each category holds several series' values side by side. */
  groups?: { label: string; values: number[] }[];
  seriesColors?: ConceptColor[]; // colour per series (grouped bars)
  seriesNames?: string[]; // legend labels per series (grouped bars)
  xDomain?: [number, number];
  yDomain?: [number, number];
  color?: ConceptColor;
  /** 0→1 builds the data (bars grow, line draws, dots pop in). */
  progress?: number;
  yAxisProgress?: number;
  xAxisProgress?: number;
  /** Wash the region under a line. Defaults on for kind="area", off otherwise. */
  fill?: boolean;
  /** line only: 0→1 rides a dot along the data (a value on the curve). */
  markerAt?: number;
  markerOpacity?: number;
  /** bar only: print each bar's value above it. */
  showValues?: boolean;
  xLabel?: string;
  yLabel?: string;
  xLog?: boolean; // log-scale the x axis (scaling-law / power-law plots)
  yLog?: boolean; // log-scale the y axis
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const stroke = cc(color).stroke;
  const wash = cc(color).fill;
  const axis = t.color.ink;
  const p = clamp01(progress);

  // All line/area points across every series (or the single `data`), for domains.
  const allPts = series.length ? series.flatMap((s) => s.data) : data;
  // Auto-fit domains to whatever data the kind carries, with a little headroom.
  const ys = kind === "bar" || kind === "histogram" ? (groups.length ? groups.flatMap((g) => g.values) : bars.map((b) => b.value)) : allPts.map((d) => d.y);
  const yMax = yDomain ? yDomain[1] : Math.max(1, ...ys) * 1.1;
  const yMin = yDomain ? yDomain[0] : Math.min(0, ...ys);
  const xs = allPts.map((d) => d.x);
  const xdom: [number, number] = xDomain ?? [Math.min(0, ...xs), Math.max(1, ...xs)];

  // Log axes for scaling-law / power-law plots — a power law reads as a straight
  // line on log-log. Log scales need a positive domain, so clamp the low end off 0.
  const xScale = (xLog ? d3.scaleLog().domain([Math.max(1e-9, xdom[0] || 1e-9), xdom[1]]) : d3.scaleLinear().domain(xdom)).range([rect.x, rect.x + rect.width]);
  const yScale = (yLog ? d3.scaleLog().domain([Math.max(1e-9, yMin || 1e-9), yMax]) : d3.scaleLinear().domain([yMin, yMax])).range([rect.y + rect.height, rect.y]);

  const ox = rect.x;
  const oy = rect.y + rect.height;
  const baseline = r3(yScale(Math.max(yMin, 0))); // bars grow from y=0, not the frame floor
  const yAp = clamp01(yAxisProgress);
  const xAp = clamp01(xAxisProgress);
  // Axes run PAST the data by the arrowhead's own length plus a gap, so the head
  // always sits in clear space beyond the last bar / tallest value (not on top of
  // it). Derived from the head size, not a hardcoded length.
  const AX_EXT = 16 * 2 + 8; // = HL*2 + gap
  const yTip = r3(oy - (rect.height + AX_EXT) * yAp);
  const xTip = r3(ox + (rect.width + AX_EXT) * xAp);
  const AW = 3;
  const HL = 16;
  const HW = 9;

  const svgBits: ReactNode[] = [];
  const seriesLabels: { x: number; y: number; text: string; color: string }[] = [];

  if (kind === "bar" || kind === "histogram") {
    // A histogram's bars touch (a continuous distribution); a bar chart's are
    // spaced and rounded (discrete categories).
    const touching = kind === "histogram";
    const n = Math.max(1, bars.length);
    const band = rect.width / n;
    const bw = touching ? band : Math.min(140, band * 0.6);
    bars.forEach((b, i) => {
      const rev = clamp01(p * n - i); // left-to-right stagger
      const eo = 1 - Math.pow(1 - rev, 3);
      const top = r3(yScale(b.value));
      const h = r3((baseline - top) * eo);
      const bx = r3(ox + band * i + (band - bw) / 2);
      const bStroke = cc(b.color ?? color).stroke;
      const bFill = cc(b.color ?? color).fill;
      svgBits.push(
        <rect
          key={`bar-${i}`}
          x={bx}
          y={r3(baseline - h)}
          width={r3(bw)}
          height={h}
          rx={touching ? 0 : 10}
          fill={bFill}
          stroke={bStroke}
          strokeWidth={touching ? 1.5 : 3}
          opacity={r3(clamp01(rev * 4))}
        />,
      );
    });
  }

  if ((kind === "bar" || kind === "histogram") && groups.length) {
    // Grouped bars: each category holds nS series side by side.
    const palette: ConceptColor[] = ["blue", "orange", "green", "purple"];
    const nG = groups.length;
    const band = rect.width / nG;
    const nS = groups[0]?.values.length ?? 1;
    const groupW = Math.min(band * 0.72, 340);
    const bw = groupW / nS;
    groups.forEach((g, gi) => {
      const rev = clamp01(p * nG - gi);
      const eo = 1 - Math.pow(1 - rev, 3);
      g.values.forEach((v, si) => {
        const col = cc(seriesColors?.[si] ?? palette[si % palette.length]);
        const top = r3(yScale(v));
        const h = r3((baseline - top) * eo);
        const bx = r3(ox + band * gi + (band - groupW) / 2 + si * bw);
        svgBits.push(<rect key={`gb-${gi}-${si}`} x={bx} y={r3(baseline - h)} width={r3(bw * 0.82)} height={h} rx={6} fill={col.fill} stroke={col.stroke} strokeWidth={2.5} opacity={r3(clamp01(rev * 4))} />);
      });
    });
  }

  if (kind === "pie") {
    // Slices sweep in clockwise from the top as `progress` fills the circle.
    const palette: ConceptColor[] = ["blue", "orange", "green", "purple"];
    const pcx = rect.x + rect.width / 2;
    const pcy = rect.y + rect.height / 2;
    const R = Math.min(rect.width, rect.height) / 2 - 20;
    const arcs = d3.pie<ChartBar>().sort(null).value((d) => d.value)(bars);
    const arcGen = d3.arc<d3.PieArcDatum<ChartBar>>().innerRadius(0).outerRadius(R);
    const maxA = p * 2 * Math.PI;
    arcs.forEach((a, i) => {
      const end = Math.min(a.endAngle, maxA);
      if (end <= a.startAngle) return;
      const col = bars[i].color ?? palette[i % palette.length];
      const d = arcGen({ ...a, endAngle: end }) ?? "";
      svgBits.push(<path key={`pie-${i}`} d={d} transform={`translate(${r3(pcx)}, ${r3(pcy)})`} fill={cc(col).fill} stroke={cc(col).stroke} strokeWidth={3} />);
      // Slice label at the centroid, once the slice is fully drawn.
      if (p > 0.92 && a.endAngle <= maxA) {
        const [lx, ly] = arcGen.centroid(a);
        svgBits.push(
          <text key={`pl-${i}`} x={r3(pcx + lx)} y={r3(pcy + ly)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={26} fontWeight={700} fill={cc(col).stroke}>
            {bars[i].label}
          </text>,
        );
      }
    });
  }

  if (kind === "line" || kind === "area") {
    const doFill = fill ?? kind === "area";
    const lineGen = d3.line<ChartPt>().x((d) => xScale(d.x)).y((d) => yScale(d.y)).curve(d3.curveNatural);
    const drawOne = (sdata: ChartPt[], sStroke: string, sWash: string, key: string) => {
      if (sdata.length < 2) return;
      if (doFill) {
        const areaGen = d3.area<ChartPt>().x((d) => xScale(d.x)).y0(baseline).y1((d) => yScale(d.y)).curve(d3.curveNatural);
        const clipW = r3(rect.width * p);
        svgBits.push(
          <clipPath key={`clip-${key}`} id={`cc-${key}`}>
            <rect x={ox} y={rect.y - 20} width={clipW} height={rect.height + 40} />
          </clipPath>,
          <path key={`area-${key}`} d={areaGen(sdata) ?? ""} fill={sWash} opacity={0.85} clipPath={`url(#cc-${key})`} />,
        );
      }
      if (p > 0)
        svgBits.push(
          <path key={`line-${key}`} d={lineGen(sdata) ?? ""} fill="none" stroke={sStroke} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={`${r3(p)} ${r3(1 - p + 0.0001)}`} />,
        );
    };
    const palette: ConceptColor[] = ["blue", "orange", "green", "purple"];
    if (series.length) {
      series.forEach((s, i) => {
        const col = s.color ?? palette[i % palette.length];
        drawOne(s.data, cc(col).stroke, cc(col).fill, `s${i}`);
        if (s.label && s.data.length) {
          const last = s.data[s.data.length - 1];
          seriesLabels.push({ x: xScale(last.x), y: yScale(last.y), text: s.label, color: cc(col).stroke });
        }
      });
    } else {
      drawOne(data, stroke, wash, "single");
      if (markerAt != null && data.length > 1) {
        const idx = clamp01(markerAt) * (data.length - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(data.length - 1, i0 + 1);
        const f = idx - i0;
        const px = data[i0].x + (data[i1].x - data[i0].x) * f;
        const py = data[i0].y + (data[i1].y - data[i0].y) * f;
        svgBits.push(<circle key="marker" cx={r3(xScale(px))} cy={r3(yScale(py))} r={13} fill={stroke} opacity={r3(clamp01(markerOpacity))} />);
      }
    }
  }

  if (kind === "scatter") {
    const n = Math.max(1, data.length);
    data.forEach((d, i) => {
      const rev = clamp01(p * n * 1.4 - i); // quick staggered pop-in
      if (rev <= 0) return;
      svgBits.push(
        <circle
          key={`pt-${i}`}
          cx={r3(xScale(d.x))}
          cy={r3(yScale(d.y))}
          r={r3(12 * (0.6 + 0.4 * rev))}
          fill={cc(d.color ?? color).fill}
          stroke={cc(d.color ?? color).stroke}
          strokeWidth={3}
          opacity={r3(rev)}
        />,
      );
    });
  }

  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        {/* Y axis grows up, X axis grows right — same arrowed axes as <Plot>. */}
        {yAp > 0.01 && (
          <>
            <line x1={ox} y1={oy} x2={ox} y2={yTip} stroke={axis} strokeWidth={AW} strokeLinecap="butt" />
            <polygon points={`${ox},${r3(yTip - 2)} ${ox - HW},${r3(yTip + HL)} ${ox + HW},${r3(yTip + HL)}`} fill={axis} />
          </>
        )}
        {xAp > 0.01 && (
          <>
            <line x1={ox} y1={oy} x2={xTip} y2={oy} stroke={axis} strokeWidth={AW} strokeLinecap="butt" />
            <polygon points={`${r3(xTip + 2)},${oy} ${r3(xTip - HL)},${oy - HW} ${r3(xTip - HL)},${oy + HW}`} fill={axis} />
          </>
        )}
        {svgBits}
      </svg>

      {/* Series end labels (multi-line charts) ride in HTML for the taste font. */}
      {seriesLabels.map((sl, i) => (
        <div key={`sl-${i}`} style={{ position: "absolute", left: sl.x + 16, top: sl.y, transform: "translateY(-50%)", fontFamily: t.font.family, fontSize: 28, fontWeight: 700, color: sl.color, opacity: r3(clamp01((p - 0.85) / 0.15)), whiteSpace: "nowrap" }}>{sl.text}</div>
      ))}
      {/* Grouped-bar category labels + legend. */}
      {groups.length > 0 &&
        groups.map((g, gi) => {
          const nG = groups.length;
          const band = rect.width / nG;
          const rev = clamp01(p * nG - gi);
          return (
            <div key={`gl-${gi}`} style={{ position: "absolute", left: ox + band * gi + band / 2, top: oy + 16, transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: 26, fontWeight: 600, color: t.color.support, opacity: r3(rev), whiteSpace: "nowrap" }}>{g.label}</div>
          );
        })}
      {seriesNames && seriesNames.length > 0 && (
        <div style={{ position: "absolute", left: rect.x + rect.width, top: rect.y - 14, transform: "translateX(-100%)", display: "flex", gap: 24, fontFamily: t.font.family, fontSize: 24, fontWeight: 600, opacity: r3(clamp01(p * 2 - 1)) }}>
          {seriesNames.map((nm, si) => {
            const col = cc(seriesColors?.[si] ?? (["blue", "orange", "green", "purple"] as ConceptColor[])[si % 4]);
            return (
              <div key={si} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: col.fill, border: `2px solid ${col.stroke}` }} />
                <span style={{ color: t.color.ink }}>{nm}</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Bar category + value labels ride in HTML so they use the taste font. */}
      {kind === "bar" &&
        bars.map((b, i) => {
          const n = Math.max(1, bars.length);
          const band = rect.width / n;
          const rev = clamp01(p * n - i);
          const cxp = ox + band * i + band / 2;
          const top = yScale(b.value);
          return (
            <div key={`blabel-${i}`}>
              <div
                style={{
                  position: "absolute",
                  left: cxp,
                  top: oy + 16,
                  transform: "translateX(-50%)",
                  fontFamily: t.font.family,
                  fontSize: 26,
                  fontWeight: 600,
                  color: t.color.support,
                  opacity: r3(rev),
                  whiteSpace: "nowrap",
                }}
              >
                {b.label}
              </div>
              {showValues && (
                <div
                  style={{
                    position: "absolute",
                    left: cxp,
                    top: top - 44,
                    transform: "translateX(-50%)",
                    fontFamily: t.font.family,
                    fontSize: 28,
                    fontWeight: 700,
                    color: cc(b.color ?? color).stroke,
                    opacity: r3(clamp01(rev * 1.4 - 0.4)),
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {b.value}
                </div>
              )}
            </div>
          );
        })}

      {xLabel && (
        <div style={{ position: "absolute", left: ox + rect.width / 2, top: oy + (kind === "bar" ? 60 : 28), transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: 30, fontWeight: 600, color: t.color.ink, opacity: r3(xAp) }}>
          {xLabel}
        </div>
      )}
      {yLabel && (
        <div style={{ position: "absolute", left: ox - 56, top: rect.y + rect.height / 2, transform: "translate(-50%, -50%) rotate(-90deg)", fontFamily: t.font.family, fontSize: 30, fontWeight: 600, color: t.color.ink, opacity: r3(yAp) }}>
          {yLabel}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Tree> — a top-down hierarchy: nodes joined parent→child (a concept tree, a
 * decision tree, a binary tree / BST). d3.hierarchy + d3.tree own the layout, so
 * siblings never overlap and the shape is always balanced; the model supplies a
 * nested `{label, color?, children?}` and picks a shape. It builds TOP-DOWN in
 * depth order — root, its edges, its children, their edges — so nothing appears
 * before its parent. `progress` (0→1) drives the build.
 * ------------------------------------------------------------------------- */

type TreeDatum = { label: string; color?: ConceptColor; children?: TreeDatum[] };

export function Tree({
  data,
  shape = "box",
  progress = 1,
  rect = { x: 300, y: 180, width: 1320, height: 700 },
  style,
}: {
  data: TreeDatum;
  /** "box" for concept/decision trees, "circle" for binary trees / BSTs. */
  shape?: "box" | "circle";
  /** 0→1 builds the tree top-down. */
  progress?: number;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const root = d3.hierarchy<TreeDatum>(data);
  d3
    .tree<TreeDatum>()
    .nodeSize([1, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.25))(root);

  const nodes = root.descendants();
  const links = root.links();
  const xs = nodes.map((n) => n.x ?? 0);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  const H = root.height || 1;
  const inset = 44; // keep boxes off the very edge so they never clip
  const px = (n: d3.HierarchyPointNode<TreeDatum>) =>
    r3(spanX > 0.001 ? rect.x + inset + ((n.x - minX) / spanX) * (rect.width - 2 * inset) : rect.x + rect.width / 2);
  const py = (n: d3.HierarchyNode<TreeDatum>) => r3(rect.y + inset + (H > 0 ? n.depth / H : 0.5) * (rect.height - 2 * inset));

  const nStages = Math.max(1, 2 * H + 1);
  const reveal = (stage: number) => clamp01(p * nStages - stage);
  const colorOf = (n: d3.HierarchyNode<TreeDatum>): ConceptColor =>
    (n.data.color as ConceptColor) ?? (n.depth === 0 ? "blue" : n.depth === H ? "green" : "orange");

  const R = 42; // circle radius for shape="circle"

  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        {links.map((link, i) => {
          const parent = link.source as d3.HierarchyPointNode<TreeDatum>;
          const child = link.target as d3.HierarchyPointNode<TreeDatum>;
          const rev = reveal(2 * child.depth - 1); // edge lands just before the child
          if (rev <= 0) return null;
          const x1 = px(parent);
          const y1 = py(parent);
          const x2 = px(child);
          const y2 = py(child);
          return (
            <line
              key={`e-${i}`}
              x1={x1}
              y1={y1}
              x2={r3(x1 + (x2 - x1) * rev)}
              y2={r3(y1 + (y2 - y1) * rev)}
              stroke={t.color.border}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const rev = reveal(2 * n.depth);
        if (rev <= 0) return null;
        const stroke = cc(colorOf(n)).stroke;
        const fill = cc(colorOf(n)).fill;
        const common: CSSProperties = {
          position: "absolute",
          left: px(n as d3.HierarchyPointNode<TreeDatum>),
          top: py(n),
          transform: `translate(-50%, -50%) scale(${r3(0.8 + 0.2 * rev)})`,
          opacity: r3(rev),
          fontFamily: t.font.family,
          color: t.color.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: n.depth === 0 || shape === "circle" ? fill : t.color.surface,
          border: `${t.strokeWidth}px solid ${stroke}`,
        };
        return shape === "circle" ? (
          <div key={`n-${i}`} style={{ ...common, width: R * 2, height: R * 2, borderRadius: "50%", fontSize: 30, fontWeight: 700 }}>
            {n.data.label}
          </div>
        ) : (
          <div key={`n-${i}`} style={{ ...common, padding: "12px 20px", borderRadius: t.radius, fontSize: t.font.labelSize, fontWeight: t.font.labelWeight, maxWidth: 260, textAlign: "center", whiteSpace: "nowrap" }}>
            {n.data.label}
          </div>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Node> — the outlined box every reference is built from (statquest's blue/
 * orange boxes, bloom's cells). Outline-only at rest; `filled` washes it with
 * its concept colour (bloom's activated cell). `color` names a concept from
 * the palette; omit it for a neutral grey node. Sizes to content, flows
 * through Stack/Row — never absolute, so collision guarantees still hold.
 * ------------------------------------------------------------------------- */

export function Node({
  color,
  filled = false,
  padding,
  style,
  children,
}: {
  color?: ConceptColor;
  filled?: boolean;
  padding?: CSSProperties["padding"];
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const t = tokens;
  const stroke = color ? cc(color).stroke : t.color.border;
  const fill = color ? cc(color).fill : "#f4f2ec";
  return (
    <div
      data-decode-box="card"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: padding ?? t.padding,
        border: `${t.strokeWidth}px solid ${stroke}`,
        borderRadius: t.radius,
        // Flat: the only change on activation is fill, no shadow.
        background: filled ? fill : t.color.surface,
        color: t.color.ink,
        fontFamily: t.font.family,
        fontSize: t.font.labelSize,
        fontWeight: t.font.labelWeight,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Network> — a neural network diagram: layers of neurons (circles) joined by
 * weighted edges. It builds LEFT TO RIGHT in dependency order — a layer's
 * neurons, then the edges into the next layer, then that layer — so an element
 * can never appear before the thing it connects to. `layers` is the neuron
 * count per layer; `progress` (0->1) drives the build.
 * ------------------------------------------------------------------------- */

export function Network({
  layers,
  layerLabels,
  layerColors,
  progress = 1,
  rect = { x: 380, y: 260, width: 1160, height: 540 },
  style,
}: {
  layers: number[]; // neuron count per layer, e.g. [3, 4, 1]
  layerLabels?: string[]; // a label under each layer
  layerColors?: ConceptColor[]; // a concept colour per layer
  /** 0->1 builds the network left to right. */
  progress?: number;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const nL = layers.length;
  const p = clamp01(progress);
  // Stages interleave neurons and edges: layer0, edges0->1, layer1, edges1->2…
  const nStages = Math.max(1, 2 * nL - 1);
  const reveal = (stage: number) => clamp01(p * nStages - stage);
  const layerColor = (li: number) =>
    layerColors?.[li] ?? (li === 0 ? "blue" : li === nL - 1 ? "green" : "orange");

  const R = 34;
  const colX = (li: number) => (nL === 1 ? rect.x + rect.width / 2 : rect.x + (li * rect.width) / (nL - 1));
  const nodeY = (li: number, i: number) => {
    const count = layers[li];
    const spacing = Math.min(140, count > 1 ? rect.height / count : 0);
    const totalH = (count - 1) * spacing;
    return rect.y + rect.height / 2 - totalH / 2 + i * spacing;
  };

  const edges: ReactNode[] = [];
  for (let l = 0; l < nL - 1; l++) {
    const rev = reveal(2 * l + 1);
    if (rev <= 0) continue;
    for (let i = 0; i < layers[l]; i++) {
      for (let j = 0; j < layers[l + 1]; j++) {
        const x1 = r3(colX(l));
        const y1 = r3(nodeY(l, i));
        const x2 = r3(colX(l + 1));
        const y2 = r3(nodeY(l + 1, j));
        edges.push(
          <line
            key={`e-${l}-${i}-${j}`}
            x1={x1}
            y1={y1}
            x2={r3(x1 + (x2 - x1) * rev)}
            y2={r3(y1 + (y2 - y1) * rev)}
            stroke={t.color.border}
            strokeWidth={2}
          />,
        );
      }
    }
  }

  const neurons: ReactNode[] = [];
  for (let l = 0; l < nL; l++) {
    const rev = reveal(2 * l);
    const stroke = cc(layerColor(l)).stroke;
    for (let i = 0; i < layers[l]; i++) {
      if (rev <= 0) continue;
      neurons.push(
        <circle
          key={`n-${l}-${i}`}
          cx={r3(colX(l))}
          cy={r3(nodeY(l, i))}
          r={r3(R * (0.7 + 0.3 * rev))}
          fill={t.color.surface}
          stroke={stroke}
          strokeWidth={4}
          opacity={r3(rev)}
        />,
      );
    }
  }

  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        {edges}
        {neurons}
      </svg>
      {layerLabels?.map((label, l) =>
        l < nL ? (
          <div
            key={`l-${l}`}
            style={{
              position: "absolute",
              left: colX(l),
              top: rect.y + rect.height + 28,
              transform: "translateX(-50%)",
              fontFamily: t.font.family,
              fontSize: 30,
              fontWeight: 600,
              color: t.color.support,
              opacity: r3(reveal(2 * l)),
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        ) : null,
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Statement> — a pure-text beat: a big centred line that reveals word-by-word
 * on the narration (each word rises + fades in as it is spoken), with key words
 * emphasised in the accent colour. Not every beat needs a diagram — sometimes
 * the idea IS the sentence. Reads the frame clock and the `words` timing.
 * ------------------------------------------------------------------------- */

type SWord = { word: string; startInSeconds: number; endInSeconds: number };

export type RevealStyle = "word" | "fade" | "rise" | "scale" | "typewriter";

export function Statement({
  text,
  words,
  emphasize,
  reveal = "word",
  size,
  accent = "blue",
  maxWidth = 1500,
  at,
  placement = "center",
  style,
}: {
  text: string;
  words?: SWord[]; // narration timings; without them the whole line is settled
  emphasize?: string[]; // words shown in the accent colour, bold
  reveal?: RevealStyle; // how the text arrives — vary it so text beats differ
  size?: number;
  accent?: ConceptColor;
  maxWidth?: number;
  at?: Pt;
  // "center" = full-frame text beat (use ALONE). "top" = a title band anchored at
  // the top edge, so it sits ABOVE a diagram without overlapping it. Title a scene
  // that also has a diagram with placement="top" — never a centered Statement.
  placement?: "center" | "top";
  style?: CSSProperties;
}) {
  const topAligned = placement === "top";
  const fontSize = size ?? (topAligned ? 54 : 92);
  const anchor = at ?? (topAligned ? { x: 960, y: 96 } : { x: 960, y: 540 });
  const yBase = topAligned ? "0px" : "-50%";
  const t = tokens;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const emph = new Set((emphasize ?? []).map((w) => norm(w)));

  // Each display word's reveal time, by walking the narration words in order.
  const display = text.split(/\s+/).filter(Boolean);
  const times: number[] = [];
  let ptr = 0;
  for (const dw of display) {
    if (!voiced) {
      times.push(0);
      continue;
    }
    const target = norm(dw);
    let found = ptr > 0 ? words![Math.min(ptr, words!.length) - 1].startInSeconds : 0;
    for (let j = ptr; j < words!.length; j++) {
      if (norm(words![j].word) === target) {
        found = words![j].startInSeconds;
        ptr = j + 1;
        break;
      }
    }
    times.push(found);
  }
  const startT = times[0] ?? 0;
  const endT = (times[times.length - 1] ?? 0) + 0.35;

  const colorOf = (word: string) => (emph.has(norm(word)) ? cc(accent).stroke : t.color.ink);
  const weightOf = (word: string) => (emph.has(norm(word)) ? 700 : 600);

  const container: CSSProperties = {
    position: "absolute",
    left: anchor.x,
    top: anchor.y,
    width: maxWidth,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: `${r3(fontSize * 0.14)}px ${r3(fontSize * 0.28)}px`,
    fontFamily: t.font.family,
    fontSize,
    fontWeight: 600,
    lineHeight: 1.15,
    textAlign: "center",
  };

  // Whole-line entrances (fade / rise / scale) — one motion on the container.
  if (reveal === "fade" || reveal === "rise" || reveal === "scale") {
    const e = voiced ? clamp01((now - startT) / 0.5) : 1;
    const eo = 1 - Math.pow(1 - e, 3); // easeOut
    const tr =
      reveal === "scale"
        ? `translate(-50%, ${yBase}) scale(${r3(0.86 + 0.14 * eo)})`
        : reveal === "rise"
          ? `translate(-50%, calc(${yBase} + ${r3((1 - eo) * fontSize * 0.4)}px))`
          : `translate(-50%, ${yBase})`;
    return (
      <div style={{ ...container, transform: tr, opacity: r3(e), ...style }}>
        {display.map((word, i) => (
          <span key={i} style={{ color: colorOf(word), fontWeight: weightOf(word) }}>
            {word}
          </span>
        ))}
      </div>
    );
  }

  // Typewriter — characters appear left to right across the narration span.
  if (reveal === "typewriter") {
    const full = display.join(" ");
    const frac = voiced ? clamp01((now - startT) / Math.max(0.4, endT - startT)) : 1;
    const shownChars = Math.round(full.length * frac);
    // Character offset where each word starts (prior words + their spaces). Derived,
    // not accumulated in a mutable let, so it stays render-pure.
    const startOf = (i: number) => display.slice(0, i).reduce((s, w) => s + w.length + 1, 0);
    return (
      <div style={{ ...container, transform: `translate(-50%, ${yBase})`, ...style }}>
        {display.map((word, i) => {
          const start = startOf(i);
          const visible = Math.max(0, Math.min(word.length, shownChars - start));
          if (visible <= 0) return null;
          return (
            <span key={i} style={{ color: colorOf(word), fontWeight: weightOf(word) }}>
              {word.slice(0, visible)}
            </span>
          );
        })}
      </div>
    );
  }

  // Default: word-by-word rise, each word on the word that is spoken.
  return (
    <div style={{ ...container, transform: "translate(-50%, -50%)", ...style }}>
      {display.map((word, i) => {
        const rev = voiced ? clamp01((now - times[i]) / 0.35) : 1;
        return (
          <span
            key={i}
            style={{
              color: colorOf(word),
              fontWeight: weightOf(word),
              opacity: r3(rev),
              transform: `translateY(${r3((1 - rev) * fontSize * 0.22)}px)`,
              display: "inline-block",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Place> — position ANY visual on the frame without raw pixel math. Every
 * component renders centred (960,540) by default; wrap it to move the whole
 * thing to a named region, so beats can hold two or three things side by side
 * without overlap. `region` is the safe, on-taste vocabulary; `at={{x,y}}` is a
 * fine-control override (a centre anchor). Regions differ => no overlap.
 *   <Place region="top"><Statement .../></Place>
 *   <Place region="bottom"><Chart .../></Place>
 * ------------------------------------------------------------------------- */

// `satisfies` (not `: Record<string, Pt>`) keeps the literal keys, so
// `PlaceRegion = keyof typeof` is the real region union — region props are
// type-checked to the valid set AND the generated component manifest can
// enumerate them, instead of both widening to `string`.
const PLACE_REGIONS = {
  center: { x: 960, y: 540 },
  top: { x: 960, y: 300 },
  bottom: { x: 960, y: 780 },
  left: { x: 640, y: 540 },
  right: { x: 1280, y: 540 },
  "center-left": { x: 700, y: 540 },
  "center-right": { x: 1220, y: 540 },
  "top-left": { x: 640, y: 320 },
  "top-right": { x: 1280, y: 320 },
  "bottom-left": { x: 640, y: 760 },
  "bottom-right": { x: 1280, y: 760 },
} satisfies Record<string, Pt>;

export type PlaceRegion = keyof typeof PLACE_REGIONS;

/** The centre anchor (frame coords) for a named region, or an explicit `at`
 *  override. Shared by <Place> (`at` path) and <Label> (text placement). */
export function regionAnchor(region: PlaceRegion = "center", at?: Pt): Pt {
  return at ?? PLACE_REGIONS[region] ?? PLACE_REGIONS.center;
}

// A named region maps to flex alignment, NOT a translate — this is what makes
// region placement impossible to push off-screen. A self-positioning child
// (Network/Chart/Spectrum at position:absolute) ignores flex, so it stays centred
// in frame however the model labels the region (a no-op, never a clip). Small FLOW
// content (Node/Term) aligns to the region edge and always stays on-screen.
type FlexAlign = "flex-start" | "center" | "flex-end";
const REGION_ALIGN: Record<PlaceRegion, { justify: FlexAlign; align: FlexAlign }> = {
  center: { justify: "center", align: "center" },
  top: { justify: "center", align: "flex-start" },
  bottom: { justify: "center", align: "flex-end" },
  left: { justify: "flex-start", align: "center" },
  right: { justify: "flex-end", align: "center" },
  "center-left": { justify: "flex-start", align: "center" },
  "center-right": { justify: "flex-end", align: "center" },
  "top-left": { justify: "flex-start", align: "flex-start" },
  "top-right": { justify: "flex-end", align: "flex-start" },
  "bottom-left": { justify: "flex-start", align: "flex-end" },
  "bottom-right": { justify: "flex-end", align: "flex-end" },
};

export function Place({
  region = "center",
  at,
  children,
  style,
}: {
  region?: PlaceRegion; // named slot — flex-aligned, cannot push content off-screen
  at?: Pt; // explicit override: centre anchor in frame coords (translate; director's tool)
  children: ReactNode;
  style?: CSSProperties;
}) {
  // Explicit `at`: translate the full-frame layer, flex-centre the child on the anchor.
  if (at) {
    const dx = r3(at.x - 960);
    const dy = r3(at.y - 540);
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: `translate(${dx}px, ${dy}px)`, ...style }}>
        {children}
      </div>
    );
  }
  // Named region: flex-align within the frame (with a safe margin). Full-size
  // absolute diagrams stay centred; small flow content aligns to the region.
  const { justify, align } = REGION_ALIGN[region] ?? REGION_ALIGN.center;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: align, justifyContent: justify, padding: 96, ...style }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <BlockDiagram> — the architecture figure (Transformer, ResNet, encoder-decoder):
 * labeled blocks stacked in data-flow order (input at the bottom for flow="up"),
 * main arrows through them, optional nested sub-blocks and residual/skip arcs on
 * the side. Grid math owns the layout and auto-fits the frame height, so any number
 * of blocks stays on screen and never overlaps. `progress` builds it in flow order.
 * ------------------------------------------------------------------------- */
export function BlockDiagram({
  blocks,
  flow = "up",
  skips = [],
  progress = 1,
  style,
}: {
  blocks: { label: string; color?: ConceptColor; sub?: string[] }[];
  flow?: "up" | "down"; // data-flow direction; "up" = input at the bottom
  skips?: { from: number; to: number; label?: string }[]; // residual/skip arcs
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = blocks.length;
  const p = clamp01(progress);
  const baseH = 104;
  const subH = 52;
  const GP = 54;
  const MAX_H = 900;
  // Block width is DERIVED from the text — the widest label (or sub-chip row) sets
  // the shared column width, so blocks expand to fit their text and never clip.
  // (Deterministic char-advance estimate; no DOM measure, safe in node + browser.)
  const CHARW = 0.58; // ~advance per char at 1px, Inter bold
  const labelPx = (s: string, size: number) => s.length * size * CHARW;
  const wantW = Math.max(
    360,
    ...blocks.map((b) => {
      const lw = labelPx(b.label, 30) + 72;
      const m = b.sub?.length ?? 0;
      const sw = m ? b.sub!.reduce((a, s) => a + Math.max(64, labelPx(s, 21) + 28), 0) + (m + 1) * 16 : 0;
      return Math.max(lw, sw);
    }),
  );
  const BW = Math.min(1360, wantW); // expands with text, capped to the frame
  const heights = blocks.map((b) => baseH + (b.sub?.length ? subH : 0));
  const rawTotal = heights.reduce((a, h) => a + h, 0) + Math.max(0, n - 1) * GP;
  const fit = Math.min(1, MAX_H / (rawTotal || 1)); // vertical fit only
  const H = heights.map((h) => r3(h * fit));
  const G = r3(GP * fit);
  const W = r3(BW * fit);
  // A label's own font shrinks only if it is still wider than the (capped) block.
  const labelFs = (s: string) => r3(Math.min(30 * fit, (W - 48) / Math.max(1, s.length * CHARW)));
  const cx = 960;
  const left = r3(cx - W / 2);
  const right = r3(cx + W / 2);
  const total = H.reduce((a, h) => a + h, 0) + Math.max(0, n - 1) * G;
  const topY = r3(540 - total / 2);
  // Drawn top→bottom: for flow "up" the last block sits at the top (output up top).
  const drawn = flow === "up" ? [...blocks.keys()].reverse() : [...blocks.keys()];
  const yTop: number[] = [];
  {
    let cur = topY;
    for (const idx of drawn) {
      yTop[idx] = cur;
      cur += H[idx] + G;
    }
  }
  const cyOf = (i: number) => r3(yTop[i] + H[i] / 2);
  const revOf = (i: number) => clamp01(p * n - i); // build in data-flow order
  const sfs = r3(21 * fit);
  const HL = 13;
  const HW = 8;

  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      {/* main flow arrows in the gaps, revealed with the block they enter */}
      {blocks.slice(0, -1).map((_, i) => {
        const a = i;
        const b = i + 1;
        const aEdge = flow === "up" ? yTop[a] : yTop[a] + H[a];
        const bEdge = flow === "up" ? yTop[b] + H[b] : yTop[b];
        const rev = revOf(b);
        if (rev <= 0.01) return null;
        const dir = Math.sign(bEdge - aEdge);
        return (
          <g key={`a-${i}`} opacity={r3(rev)}>
            <line x1={cx} y1={r3(aEdge)} x2={cx} y2={r3(bEdge - dir * HL)} stroke={t.color.ink} strokeWidth={3} />
            <polygon points={`${cx},${r3(bEdge)} ${cx - HW},${r3(bEdge - dir * HL)} ${cx + HW},${r3(bEdge - dir * HL)}`} fill={t.color.ink} />
          </g>
        );
      })}
      {/* residual / skip arcs on the right */}
      {skips.map((s, i) => {
        const rev = clamp01(Math.min(revOf(s.from), revOf(s.to)));
        if (rev <= 0.01) return null;
        const y1 = cyOf(s.from);
        const y2 = cyOf(s.to);
        const bow = r3(right + 90 * fit);
        const col = cc(blocks[s.to]?.color ?? "blue").stroke;
        return (
          <g key={`s-${i}`} opacity={r3(rev)}>
            <path d={`M ${right} ${r3(y1)} C ${bow} ${r3(y1)}, ${bow} ${r3(y2)}, ${r3(right + HL)} ${r3(y2)}`} fill="none" stroke={col} strokeWidth={3} />
            <polygon points={`${right},${r3(y2)} ${r3(right + HL)},${r3(y2 - HW)} ${r3(right + HL)},${r3(y2 + HW)}`} fill={col} />
            {s.label && (
              <text x={r3(bow + 12)} y={r3((y1 + y2) / 2)} fontFamily={t.font.family} fontSize={sfs} fill={t.color.support} dominantBaseline="middle">{s.label}</text>
            )}
          </g>
        );
      })}
      {/* blocks */}
      {blocks.map((b, i) => {
        const rev = revOf(i);
        if (rev <= 0) return null;
        const col = cc(b.color ?? "blue");
        const y = yTop[i];
        const h = H[i];
        const hasSub = !!b.sub?.length;
        return (
          <g key={`b-${i}`} opacity={r3(rev)} transform={`translate(0 ${r3((1 - rev) * 12)})`}>
            <rect x={left} y={r3(y)} width={W} height={r3(h)} rx={r3(16 * fit)} fill={col.fill} stroke={col.stroke} strokeWidth={3} />
            <text x={cx} y={r3(hasSub ? y + baseH * fit * 0.42 : y + h / 2)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={labelFs(b.label)} fontWeight={700} fill={t.color.ink}>{b.label}</text>
            {hasSub &&
              b.sub!.map((sl, j) => {
                const m = b.sub!.length;
                const pad = r3(16 * fit);
                const cw = r3((W - pad * 2 - (m - 1) * pad) / m);
                const chx = r3(left + pad + j * (cw + pad));
                const chy = r3(y + baseH * fit * 0.66);
                const chh = r3(subH * fit * 0.7);
                return (
                  <g key={j}>
                    <rect x={chx} y={chy} width={cw} height={chh} rx={r3(9 * fit)} fill={t.color.surface} stroke={col.stroke} strokeWidth={2} />
                    <text x={r3(chx + cw / 2)} y={r3(chy + chh / 2)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={sfs} fill={t.color.ink}>{sl}</text>
                  </g>
                );
              })}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <MatrixOp> — a matrix operation as a figure: A · B = C, with dimension labels
 * and an optional highlight that lights row i of A, column j of B and cell (i,j)
 * of C together (the multiply that produces one output). The core ML-paper visual
 * (QKᵀ, a linear layer, any GEMM). Grid math sizes the cells to fit all three
 * matrices + operators in frame. `progress` reveals A, then B, then computes C.
 * ------------------------------------------------------------------------- */
export function MatrixOp({
  a,
  b,
  c,
  op = "×",
  color = "blue",
  highlight,
  labels,
  progress = 1,
  style,
}: {
  a: number[][];
  b: number[][];
  c?: number[][]; // result; omit to compute A·B
  op?: string;
  color?: ConceptColor;
  highlight?: { row: number; col: number }; // lights A's row, B's col, C's cell
  labels?: { a?: string; b?: string; c?: string }; // dim captions; omit for m×n
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const p = clamp01(progress);
  const A = a;
  const B = b;
  const ma = A.length;
  const ka = A[0]?.length ?? 0;
  const kb = B.length;
  const nb = B[0]?.length ?? 0;
  const C =
    c ??
    A.map((row) => (B[0] ?? []).map((_, j) => r3(row.reduce((s, v, k) => s + v * (B[k]?.[j] ?? 0), 0))));
  const mc = C.length;
  const nc = C[0]?.length ?? 0;

  const CSbase = 88;
  const GAP = 70;
  const OPW = 62;
  const cols = ka + nb + nc;
  const rawW = cols * CSbase + 2 * OPW + 2 * GAP;
  const rawH = Math.max(ma, kb, mc) * CSbase;
  const fit = Math.min(1, 1740 / rawW, 700 / rawH);
  const CS = r3(CSbase * fit);
  const gap = r3(GAP * fit);
  const opw = r3(OPW * fit);
  const totalW = cols * CS + 2 * opw + 2 * gap;
  const x0 = r3(960 - totalW / 2);
  const fs = r3(30 * fit);
  const lfs = r3(26 * fit);
  const cy = 540;

  const grids = [
    { m: A, rows: ma, colsN: ka, x: x0, rev: clamp01(p * 3), label: labels?.a ?? `${ma}×${ka}`, kind: "a" },
    { m: B, rows: kb, colsN: nb, x: r3(x0 + ka * CS + opw + 2 * gap), rev: clamp01(p * 3 - 1), label: labels?.b ?? `${kb}×${nb}`, kind: "b" },
    { m: C, rows: mc, colsN: nc, x: r3(x0 + (ka + nb) * CS + 2 * opw + 4 * gap), rev: clamp01(p * 3 - 2), label: labels?.c ?? `${mc}×${nc}`, kind: "c" },
  ];
  const opX1 = r3(x0 + ka * CS + gap + opw / 2);
  const opX2 = r3(x0 + (ka + nb) * CS + opw + 3 * gap + opw / 2);

  const lit = (kind: string, i: number, j: number) => {
    if (!highlight) return false;
    if (kind === "a") return i === highlight.row;
    if (kind === "b") return j === highlight.col;
    return i === highlight.row && j === highlight.col; // c
  };

  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      {grids.map((g) => {
        const gTop = r3(cy - (g.rows * CS) / 2);
        if (g.rev <= 0) return null;
        return (
          <g key={g.kind} opacity={r3(g.rev)}>
            {g.m.map((row, i) =>
              row.map((v, j) => {
                const on = lit(g.kind, i, j);
                return (
                  <g key={`${i}-${j}`}>
                    <rect x={r3(g.x + j * CS)} y={r3(gTop + i * CS)} width={r3(CS - 4)} height={r3(CS - 4)} rx={r3(8 * fit)} fill={on ? acc.fill : t.color.surface} stroke={on ? acc.stroke : t.color.border} strokeWidth={on ? 3 : 2} />
                    <text x={r3(g.x + j * CS + CS / 2 - 2)} y={r3(gTop + i * CS + CS / 2 - 2)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={fs} fontWeight={on ? 700 : 500} fill={on ? acc.stroke : t.color.ink}>{v}</text>
                  </g>
                );
              }),
            )}
            <text x={r3(g.x + (g.colsN * CS) / 2)} y={r3(gTop + g.rows * CS + 34 * fit)} textAnchor="middle" fontFamily={t.font.family} fontSize={lfs} fill={t.color.support}>{g.label}</text>
          </g>
        );
      })}
      <text x={opX1} y={cy} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={r3(46 * fit)} fill={t.color.ink} opacity={r3(clamp01(p * 3 - 0.5))}>{op}</text>
      <text x={opX2} y={cy} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={r3(46 * fit)} fill={t.color.ink} opacity={r3(clamp01(p * 3 - 1.5))}>=</text>
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <SequenceLinks> — a row of tokens with weighted arcs between them: self-attention,
 * dependencies, alignment. Each token chip sizes to its text; the row auto-fits the
 * frame width. A link's `weight` (0–1) sets the arc's thickness and opacity, so
 * strong attention reads darker/thicker. `progress` reveals the tokens, then draws
 * the arcs.
 * ------------------------------------------------------------------------- */
export function SequenceLinks({
  tokens: toks,
  links = [],
  color = "blue",
  progress = 1,
  style,
}: {
  tokens: { label: string; color?: ConceptColor }[];
  links?: { from: number; to: number; weight?: number; color?: ConceptColor }[];
  color?: ConceptColor;
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = toks.length;
  const p = clamp01(progress);
  const CHARW = 0.58;
  const fsB = 32;
  const padB = 26;
  const gapB = 26;
  const hB = 78;
  const rawW = toks.reduce((a, tk) => a + Math.max(90, tk.label.length * fsB * CHARW + padB * 2), 0) + Math.max(0, n - 1) * gapB;
  const fit = Math.min(1, 1740 / (rawW || 1));
  const fs = r3(fsB * fit);
  const gap = r3(gapB * fit);
  const h = r3(hB * fit);
  const widths = toks.map((tk) => r3(Math.max(90, tk.label.length * fsB * CHARW + padB * 2) * fit));
  const totalW = widths.reduce((a, w) => a + w, 0) + Math.max(0, n - 1) * gap;
  const x0 = r3(960 - totalW / 2);
  const yRow = 660;
  const cx: number[] = [];
  {
    let cur = x0;
    for (let i = 0; i < n; i++) {
      cx[i] = r3(cur + widths[i] / 2);
      cur += widths[i] + gap;
    }
  }
  const yTop = r3(yRow - h / 2);
  const tokRev = (i: number) => clamp01(p * 2 - (i / Math.max(1, n)) * 1.2);
  const arcsP = clamp01((p - 0.5) / 0.5);

  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      {/* weighted arcs above the row */}
      {links.map((lk, i) => {
        const rev = clamp01(arcsP * (links.length + 1) - i);
        if (rev <= 0.01 || lk.from === lk.to) return null;
        const w = clamp01(lk.weight ?? 0.7);
        const acc = cc(lk.color ?? color).stroke;
        const x1 = cx[lk.from];
        const x2 = cx[lk.to];
        const span = Math.abs(lk.from - lk.to);
        const peak = r3(yTop - (60 + span * 46) * fit);
        const mx = r3((x1 + x2) / 2);
        return (
          <path key={`l-${i}`} d={`M ${x1} ${yTop} Q ${mx} ${peak}, ${x2} ${yTop}`} fill="none" stroke={acc} strokeWidth={r3(2 + w * 6)} opacity={r3(rev * (0.3 + w * 0.7))} strokeLinecap="round" />
        );
      })}
      {/* self-loops */}
      {links.map((lk, i) => {
        const rev = clamp01(arcsP * (links.length + 1) - i);
        if (rev <= 0.01 || lk.from !== lk.to) return null;
        const w = clamp01(lk.weight ?? 0.7);
        const acc = cc(lk.color ?? color).stroke;
        const x = cx[lk.from];
        const rr = r3(34 * fit);
        return (
          <path key={`s-${i}`} d={`M ${r3(x - rr)} ${yTop} C ${r3(x - rr)} ${r3(yTop - rr * 2.4)}, ${r3(x + rr)} ${r3(yTop - rr * 2.4)}, ${r3(x + rr)} ${yTop}`} fill="none" stroke={acc} strokeWidth={r3(2 + w * 6)} opacity={r3(rev * (0.3 + w * 0.7))} strokeLinecap="round" />
        );
      })}
      {/* token chips */}
      {toks.map((tk, i) => {
        const rev = tokRev(i);
        if (rev <= 0) return null;
        const col = cc(tk.color ?? color);
        return (
          <g key={`t-${i}`} opacity={r3(rev)}>
            <rect x={r3(cx[i] - widths[i] / 2)} y={yTop} width={widths[i]} height={h} rx={r3(12 * fit)} fill={col.fill} stroke={col.stroke} strokeWidth={2.5} />
            <text x={cx[i]} y={r3(yRow)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={fs} fontWeight={600} fill={t.color.ink}>{tk.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <Density> — a probability density: a smooth curve with the area under it, an
 * optional shaded sub-region [a,b] (a probability mass / integral), and an optional
 * sample rug on the axis. For softmax/Gaussian/posterior beats. `progress` draws it
 * left→right; the shaded mass fades in after.
 * ------------------------------------------------------------------------- */
export function Density({
  curve,
  xDomain,
  shade,
  samples = [],
  color = "blue",
  progress = 1,
  rect = { x: 360, y: 230, width: 1200, height: 540 },
  style,
}: {
  curve: { x: number; y: number }[];
  xDomain: [number, number];
  shade?: [number, number]; // shade the area under the curve between these x's
  samples?: number[]; // rug ticks along the axis
  color?: ConceptColor;
  progress?: number;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const p = clamp01(progress);
  const yMax = Math.max(1e-6, ...curve.map((d) => d.y));
  const x = d3.scaleLinear().domain(xDomain).range([rect.x, rect.x + rect.width]);
  const y = d3.scaleLinear().domain([0, yMax * 1.12]).range([rect.y + rect.height, rect.y]);
  const base = rect.y + rect.height;
  const line = d3.line<{ x: number; y: number }>().x((d) => x(d.x)).y((d) => y(d.y)).curve(d3.curveNatural);
  const area = d3.area<{ x: number; y: number }>().x((d) => x(d.x)).y0(base).y1((d) => y(d.y)).curve(d3.curveNatural);
  const path = line(curve) ?? "";
  const fillPath = area(curve) ?? "";
  const shadePts = shade ? curve.filter((d) => d.x >= shade[0] && d.x <= shade[1]) : [];
  const shadePath = shadePts.length ? area(shadePts) ?? "" : "";
  const revW = r3(rect.width * p);
  const clipId = `dens-${r3(rect.x)}-${r3(rect.y)}`;
  const shadeIn = clamp01((p - 0.6) / 0.4);

  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={rect.x} y={r3(rect.y - 40)} width={revW} height={r3(rect.height + 80)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={fillPath} fill={acc.fill} opacity={0.7} />
        {shadePath && <path d={shadePath} fill={acc.stroke} opacity={r3(0.28 * shadeIn)} />}
        <path d={path} fill="none" stroke={acc.stroke} strokeWidth={5} strokeLinecap="round" />
      </g>
      <line x1={rect.x} y1={base} x2={r3(rect.x + rect.width)} y2={base} stroke={t.color.ink} strokeWidth={3} />
      {samples.map((s, i) => (
        <line key={i} x1={r3(x(s))} y1={base} x2={r3(x(s))} y2={r3(base + 18)} stroke={acc.stroke} strokeWidth={2.5} opacity={r3(clamp01(p * 1.5 - x(s) / (rect.x + rect.width)))} />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <SplitPanel> — a comparison frame: two or three titled panels side by side with
 * a divider, for "ours vs baseline" / "before vs after". It draws the framed,
 * titled regions; compose the content of each half with `<Place>` (region "left" /
 * "right") or a component's own `rect`/`at`. `progress` reveals the panels.
 * ------------------------------------------------------------------------- */
const SPLIT = { M: 260, GAP: 64, top: 300, H: 480, headH: 72 };

/** The body centre of each panel — Place your content here so it stays in sync with
 *  the panel geometry (never hardcode the coordinates). */
export function splitPanelCenters(n = 2): Pt[] {
  const totalW = 1920 - 2 * SPLIT.M;
  const W = (totalW - (n - 1) * SPLIT.GAP) / n;
  const bodyCy = SPLIT.top + SPLIT.headH + (SPLIT.H - SPLIT.headH) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: r3(SPLIT.M + i * (W + SPLIT.GAP) + W / 2),
    y: r3(bodyCy),
  }));
}

export function SplitPanel({
  panels,
  progress = 1,
  style,
}: {
  panels: { title: string; color?: ConceptColor }[];
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = panels.length;
  const p = clamp01(progress);
  const { M, GAP, top, H, headH } = SPLIT;
  const totalW = 1920 - 2 * M;
  const W = r3((totalW - (n - 1) * GAP) / n);
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      {panels.map((pan, i) => {
        const rev = clamp01(p * n - i);
        if (rev <= 0) return null;
        const col = cc(pan.color ?? "blue");
        const x = r3(M + i * (W + GAP));
        return (
          <g key={i} opacity={r3(rev)}>
            <rect x={x} y={top} width={W} height={H} rx={20} fill={t.color.surface} stroke={t.color.border} strokeWidth={2} />
            <rect x={x} y={top} width={W} height={headH} rx={20} fill={col.fill} stroke="none" />
            <rect x={x} y={r3(top + headH - 20)} width={W} height={20} fill={col.fill} />
            <text x={r3(x + W / 2)} y={r3(top + headH / 2)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={32} fontWeight={700} fill={col.stroke}>{pan.title}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <Callout> — annotate a spot on any figure: a dot at `at`, a leader line, and a
 * label bubble that sizes to its text. Compose it OVER another visual (a Plot's
 * minimum, a block, a cell) to point and name — the annotation every explainer
 * uses. `progress` pops the dot, draws the line, then fades the label.
 * ------------------------------------------------------------------------- */
export function Callout({
  at,
  label,
  side = "right",
  color = "orange",
  distance = 220,
  progress = 1,
  style,
}: {
  at: Pt; // the point being annotated
  label: string;
  side?: "left" | "right" | "up" | "down";
  color?: ConceptColor;
  distance?: number; // leader length
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const p = clamp01(progress);
  const dir = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[side];
  const ex = r3(at.x + dir[0] * distance); // leader end
  const ey = r3(at.y + dir[1] * distance);
  const fs = 30;
  const padX = 22;
  const bw = r3(Math.min(560, label.length * fs * 0.58 + padX * 2));
  const bh = 60;
  // bubble sits past the leader end, its near edge meeting the line
  const bx = side === "left" ? r3(ex - bw) : side === "right" ? ex : r3(ex - bw / 2);
  const by = side === "up" ? r3(ey - bh) : side === "down" ? ey : r3(ey - bh / 2);
  const dotIn = clamp01(p / 0.3);
  const lineIn = clamp01((p - 0.2) / 0.5);
  const labelIn = clamp01((p - 0.55) / 0.45);
  const lineEndX = r3(at.x + (ex - at.x) * lineIn);
  const lineEndY = r3(at.y + (ey - at.y) * lineIn);

  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      <line x1={r3(at.x)} y1={r3(at.y)} x2={lineEndX} y2={lineEndY} stroke={acc.stroke} strokeWidth={3} opacity={r3(lineIn)} />
      <circle cx={r3(at.x)} cy={r3(at.y)} r={r3(9 * dotIn)} fill={acc.stroke} />
      <g opacity={r3(labelIn)}>
        <rect x={bx} y={by} width={bw} height={bh} rx={14} fill={acc.fill} stroke={acc.stroke} strokeWidth={2.5} />
        <text x={r3(bx + bw / 2)} y={r3(by + bh / 2)} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={fs} fontWeight={600} fill={t.color.ink}>{label}</text>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <Derivation> — an equation transformed line by line, each step revealed in turn
 * and aligned on the "=" so the manipulation reads top-to-bottom. An optional grey
 * `note` per step says what happened ("multiply out", "chain rule"). For proofs and
 * gradient derivations. `progress` reveals the steps in order.
 * ------------------------------------------------------------------------- */
export function Derivation({
  steps,
  progress = 1,
  style,
}: {
  steps: { text: string; note?: string }[]; // each `text` is one equation line (split on the first "=")
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const n = steps.length;
  const parsed = steps.map((s) => {
    const i = s.text.indexOf("=");
    return i >= 0
      ? { lhs: s.text.slice(0, i).trim(), rhs: s.text.slice(i + 1).trim(), note: s.note }
      : { lhs: "", rhs: s.text.trim(), note: s.note };
  });
  const fs = 46;
  const rowH = 96;
  const totalH = n * rowH;
  const top = r3(540 - totalH / 2);
  return (
    <div style={{ position: "absolute", left: 960, top, transform: "translateX(-50%)", fontFamily: t.font.family, ...style }}>
      {parsed.map((s, i) => {
        const rev = clamp01(p * n - i);
        if (rev <= 0) return null;
        return (
          <div key={i} style={{ height: rowH, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 18, opacity: r3(rev), transform: `translateY(${r3((1 - rev) * 14)}px)`, whiteSpace: "nowrap" }}>
            <div style={{ textAlign: "right", fontSize: fs, fontWeight: 600, color: t.color.ink }}>{s.lhs}</div>
            <div style={{ fontSize: fs, color: t.color.support }}>{s.lhs ? "=" : ""}</div>
            <div style={{ textAlign: "left", fontSize: fs, fontWeight: 600, color: t.color.ink, display: "flex", alignItems: "center", gap: 24 }}>
              <span>{s.rhs}</span>
              {s.note && <span style={{ fontSize: 27, color: t.color.support, fontWeight: 500 }}>{s.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <LossLandscape> — an optimization landscape: nested contour rings (the bowl,
 * deepening toward the minimum) with a gradient-descent path stepping downhill to
 * it. For optimization / training-dynamics beats. `path` points are normalized
 * (0..1) within the rect; `progress` draws the contours then walks the path.
 * ------------------------------------------------------------------------- */
export function LossLandscape({
  path,
  min,
  color = "blue",
  progress = 1,
  rect = { x: 560, y: 180, width: 800, height: 720 },
  style,
}: {
  path: { x: number; y: number }[]; // normalized 0..1 within rect, start → minimum
  min?: { x: number; y: number }; // normalized; defaults to the last path point
  color?: ConceptColor;
  progress?: number;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const p = clamp01(progress);
  const px = (nx: number) => r3(rect.x + nx * rect.width);
  const py = (ny: number) => r3(rect.y + ny * rect.height);
  // Robust to a bad `min` (a bare `min` prop lands as `true`): only an {x,y} object
  // is honoured, else the minimum IS the path's end, else the field centre.
  const m =
    min && typeof min === "object" && typeof (min as { x?: unknown }).x === "number"
      ? (min as { x: number; y: number })
      : path[path.length - 1] ?? { x: 0.5, y: 0.5 };
  const mx = px(m.x);
  const my = py(m.y);
  const rings = 6;
  const contoursIn = clamp01(p / 0.3);
  const pts = path.map((pt) => ({ x: px(pt.x), y: py(pt.y) }));
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      {Array.from({ length: rings }, (_, i) => {
        const k = (rings - i) / rings; // 1 (outer) .. 1/rings (inner)
        return (
          <ellipse key={i} cx={mx} cy={my} rx={r3(rect.width * 0.48 * k)} ry={r3(rect.height * 0.46 * k)} fill={i === rings - 1 ? acc.fill : "none"} stroke={acc.stroke} strokeWidth={2} opacity={r3(contoursIn * (0.12 + 0.16 * (1 - k)))} />
        );
      })}
      <circle cx={mx} cy={my} r={10} fill={acc.stroke} opacity={r3(contoursIn)} />
      {pts.slice(1).map((pt, i) => {
        const a = pts[i];
        const rev = clamp01(((p - 0.3) / 0.7) * pts.length - i);
        if (rev <= 0.01) return null;
        return (
          <g key={i} opacity={r3(rev)}>
            <line x1={a.x} y1={a.y} x2={pt.x} y2={pt.y} stroke={t.color.ink} strokeWidth={3} />
            <circle cx={pt.x} cy={pt.y} r={7} fill={t.color.ink} />
          </g>
        );
      })}
      {pts[0] && <circle cx={pts[0].x} cy={pts[0].y} r={9} fill={acc.stroke} opacity={r3(clamp01((p - 0.3) / 0.1))} />}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <Unroll> — a recurrence unrolled across time: identical cells in a row passing a
 * hidden state left→right, with per-step inputs below and outputs above. For RNNs,
 * diffusion steps, any repeated-over-time computation. `progress` builds it L→R.
 * ------------------------------------------------------------------------- */
export function Unroll({
  cells,
  cellLabel = "",
  color = "blue",
  progress = 1,
  style,
}: {
  cells: { input?: string; output?: string; label?: string }[];
  cellLabel?: string; // shared label when the cells are identical (e.g. "RNN")
  color?: ConceptColor;
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const n = cells.length;
  const p = clamp01(progress);
  const CW = 156;
  const GAP = 96;
  const CH = 132;
  const rawW = n * CW + (n - 1) * GAP;
  const fit = Math.min(1, 1560 / (rawW || 1));
  const cw = r3(CW * fit);
  const gap = r3(GAP * fit);
  const ch = r3(CH * fit);
  const totalW = n * cw + (n - 1) * gap;
  const x0 = r3(960 - totalW / 2);
  const cy = 540;
  const top = r3(cy - ch / 2);
  const cellX = (i: number) => r3(x0 + i * (cw + gap));
  const revOf = (i: number) => clamp01(p * n - i);
  const fs = r3(34 * fit);
  const lfs = r3(28 * fit);
  const HL = 12;
  const HW = 7;
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
      {/* hidden-state arrows between cells */}
      {cells.slice(0, -1).map((_, i) => {
        const rev = revOf(i + 1);
        if (rev <= 0.01) return null;
        const x1 = r3(cellX(i) + cw);
        const x2 = r3(cellX(i + 1));
        return (
          <g key={`h-${i}`} opacity={r3(rev)}>
            <line x1={x1} y1={cy} x2={r3(x2 - HL)} y2={cy} stroke={t.color.ink} strokeWidth={3} />
            <polygon points={`${x2},${cy} ${r3(x2 - HL)},${r3(cy - HW)} ${r3(x2 - HL)},${r3(cy + HW)}`} fill={t.color.ink} />
          </g>
        );
      })}
      {cells.map((c, i) => {
        const rev = revOf(i);
        if (rev <= 0) return null;
        const x = cellX(i);
        const mcx = r3(x + cw / 2);
        return (
          <g key={i} opacity={r3(rev)}>
            {/* input arrow up into the cell */}
            {c.input && (
              <>
                <text x={mcx} y={r3(top + ch + 74 * fit)} textAnchor="middle" fontFamily={t.font.family} fontSize={lfs} fill={t.color.support}>{c.input}</text>
                <line x1={mcx} y1={r3(top + ch + 48 * fit)} x2={mcx} y2={r3(top + ch + HL)} stroke={t.color.support} strokeWidth={2.5} />
                <polygon points={`${mcx},${r3(top + ch)} ${r3(mcx - HW)},${r3(top + ch + HL)} ${r3(mcx + HW)},${r3(top + ch + HL)}`} fill={t.color.support} />
              </>
            )}
            {/* output arrow up out of the cell */}
            {c.output && (
              <>
                <line x1={mcx} y1={r3(top)} x2={mcx} y2={r3(top - 48 * fit + HL)} stroke={acc.stroke} strokeWidth={2.5} />
                <polygon points={`${mcx},${r3(top - 48 * fit)} ${r3(mcx - HW)},${r3(top - 48 * fit + HL)} ${r3(mcx + HW)},${r3(top - 48 * fit + HL)}`} fill={acc.stroke} />
                <text x={mcx} y={r3(top - 62 * fit)} textAnchor="middle" fontFamily={t.font.family} fontSize={lfs} fontWeight={600} fill={acc.stroke}>{c.output}</text>
              </>
            )}
            <rect x={x} y={top} width={cw} height={ch} rx={r3(14 * fit)} fill={acc.fill} stroke={acc.stroke} strokeWidth={2.5} />
            <text x={mcx} y={cy} textAnchor="middle" dominantBaseline="middle" fontFamily={t.font.family} fontSize={fs} fontWeight={700} fill={t.color.ink}>{c.label ?? cellLabel}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <CheckList> — items that check off one by one: each row appears, then its box
 * fills with a checkmark. For steps completing, requirements met, or an end-of-
 * lesson recap. Auto-fits the height; `progress` walks the list top-to-bottom.
 * ------------------------------------------------------------------------- */
export function CheckList({
  items,
  color = "green",
  progress = 1,
  at = { x: 960, y: 540 },
  style,
}: {
  items: { text: string; color?: ConceptColor }[];
  color?: ConceptColor;
  progress?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = items.length;
  const p = clamp01(progress);
  const ROWb = 104;
  const boxb = 54;
  const gapb = 32;
  const fsb = 42;
  const MAX_H = 880;
  const fit = Math.min(1, MAX_H / (n * ROWb || 1));
  const ROW = r3(ROWb * fit);
  const box = r3(boxb * fit);
  const gap = r3(gapb * fit);
  const fs = r3(fsb * fit);
  const CHARW = 0.55;
  const longest = Math.max(6, ...items.map((it) => it.text.length));
  const blockW = r3(box + gap + longest * fsb * fit * CHARW);
  const totalH = n * ROW;
  const left = r3(at.x - blockW / 2);
  const top = r3(at.y - totalH / 2);
  return (
    <div style={{ position: "absolute", left, top, width: blockW, height: totalH, fontFamily: t.font.family, ...style }}>
      {items.map((it, i) => {
        // Each item gets a window that FINISHES by p=1 — even the last one. The row
        // fades in, then the box fills with the check. (The old `p*n - i` stagger left
        // the last item's check only ~65% done at progress=1, so its ✓ never formed.)
        const step = 1 / (n + 1);
        const li = clamp01((p - i * step) / (2 * step));
        if (li <= 0) return null;
        const rev = clamp01(li / 0.45); // row fades/slides in
        const fill = clamp01((li - 0.45) / 0.55); // then the check fills
        const col = cc(it.color ?? color);
        const checked = fill > 0.5;
        return (
          <div key={i} style={{ position: "absolute", top: r3(i * ROW), left: 0, height: ROW, display: "flex", alignItems: "center", gap, opacity: r3(rev), transform: `translateX(${r3((1 - rev) * 16)}px)` }}>
            <div style={{ width: box, height: box, borderRadius: r3(14 * fit), border: `3px solid ${checked ? col.stroke : t.color.border}`, background: checked ? col.stroke : t.color.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#ffffff", fontSize: r3(box * 0.6), fontWeight: 800, lineHeight: 1, transform: `scale(${r3(fill)})` }}>✓</span>
            </div>
            <div style={{ fontSize: fs, fontWeight: 600, color: t.color.ink }}>{it.text}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <ScribbleCircle> — a hand-drawn circle drawn ON around a word or a spot (the
 * "circle the important thing" move). Give `text` and it renders the word with a
 * circle sized to it; or give `at` + `width`/`height` to ring an existing element.
 * `progress` draws the loop on; the slight wobble + overshoot read as hand-drawn.
 * ------------------------------------------------------------------------- */
export function ScribbleCircle({
  text,
  at = { x: 960, y: 540 },
  width,
  height,
  color = "orange",
  size = 72,
  progress = 1,
  style,
}: {
  text?: string; // optional: renders the word with the circle sized around it
  at?: Pt; // centre of the circle
  width?: number; // ellipse full width (auto from text when text is given)
  height?: number; // ellipse full height
  color?: ConceptColor;
  size?: number; // font size when `text` is given
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const p = clamp01(progress);
  const textW = text ? text.length * size * 0.58 : 0;
  const rx = r3((width ?? textW + size * 0.9) / 2);
  const ry = r3((height ?? size * 1.7) / 2);
  const cx = at.x;
  const cy = at.y;
  // A slightly wobbly ellipse that overshoots one turn — a hand-drawn loop. Quantise
  // every point (r3) so node/browser libm differences can't cause a hydration mismatch.
  const N = 72;
  const turns = 1.08;
  const startA = -0.4;
  const rot = 0.06;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = startA + turns * 2 * Math.PI * (i / N);
    const wob = 1 + 0.022 * Math.sin(a * 3.1 + 1);
    const ex = rx * wob * Math.cos(a);
    const ey = ry * wob * Math.sin(a);
    const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
    pts.push(`${r3(x)} ${r3(y)}`);
  }
  const d = "M " + pts.join(" L ");
  return (
    <>
      {text && (
        <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%, -50%)", fontFamily: t.font.family, fontSize: size, fontWeight: 700, color: t.color.ink, whiteSpace: "nowrap", ...style }}>{text}</div>
      )}
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        <path d={d} fill="none" stroke={acc.stroke} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${r3(p)} ${r3(1 - p + 0.0001)}`} />
      </svg>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Terminal> — a clean terminal card: command lines TYPE out, output lines reveal
 * in sequence, a block cursor rides the line being typed. For CLI/dev explainers.
 * The card sizes to the longest line + line count. `progress` walks the lines.
 * ------------------------------------------------------------------------- */
export function Terminal({
  lines,
  title = "",
  fontSize = 34,
  progress = 1,
  at = { x: 960, y: 540 },
  style,
}: {
  lines: { text: string; kind?: "cmd" | "out" | "comment" }[]; // cmd types; out/comment fade
  title?: string;
  fontSize?: number; // terminal text size; card + line spacing scale with it
  progress?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const blink = Math.floor(now / 0.53) % 2 === 0; // cursor blink, ~0.53s each phase
  const p = clamp01(progress);
  const n = lines.length;
  const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
  const fs = fontSize;
  const titleH = 52;
  const lineH = r3(fs * 1.55);
  const padX = r3(fs * 1.3);
  const padTop = r3(titleH + fs * 1.05);
  const padBot = r3(fs * 1.15);
  const CHARW = 0.6;
  const longest = Math.max(10, ...lines.map((l) => l.text.length + (l.kind === "cmd" ? 2 : 0)));
  const bodyW = r3(Math.min(1520, longest * fs * CHARW + padX * 2));
  const bodyH = r3(padTop + n * lineH + padBot);
  const left = r3(at.x - bodyW / 2);
  const top = r3(at.y - bodyH / 2);
  const lineProg = (i: number) => clamp01(p * n - i);
  return (
    <div style={{ position: "absolute", left, top, width: bodyW, height: bodyH, background: "#232323", borderRadius: 16, overflow: "hidden", fontFamily: MONO, ...style }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 52, background: "#2d2d2d", display: "flex", alignItems: "center", paddingLeft: 22, gap: 11 }}>
        {["#e0605e", "#e0b74e", "#5fb85f"].map((c, i) => (
          <span key={i} style={{ width: 15, height: 15, borderRadius: "50%", background: c }} />
        ))}
        {title && <span style={{ marginLeft: 18, color: "#9a9a9a", fontSize: 24 }}>{title}</span>}
      </div>
      <div style={{ position: "absolute", top: padTop, left: padX, right: padX }}>
        {lines.map((l, i) => {
          const lp = lineProg(i);
          const kind = l.kind ?? "out";
          // The first prompt sits ready from the start (a real terminal opens with
          // `$ ▋` waiting), so the card is never blank before typing begins.
          const isFirstCmd = i === 0 && kind === "cmd";
          if (lp <= 0 && !isFirstCmd) return null;
          const y = i * lineH;
          if (kind === "cmd") {
            const shown = l.text.slice(0, Math.floor(lp * l.text.length));
            const typing = lp < 1; // this line is the one being typed (or waiting at 0)
            return (
              <div key={i} style={{ position: "absolute", top: y, fontSize: fs, whiteSpace: "pre", color: "#f0f0f0" }}>
                <span style={{ color: "#5fb85f" }}>$ </span>
                {shown}
                {typing && <span style={{ color: "#f0f0f0", opacity: blink ? 1 : 0.15 }}>▋</span>}
              </div>
            );
          }
          return (
            <div key={i} style={{ position: "absolute", top: y, fontSize: fs, whiteSpace: "pre", color: kind === "comment" ? "#8a8a8a" : "#c9c9c9", opacity: r3(lp) }}>
              {l.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <MarkerHighlight> — a highlighter sweep behind a word or phrase (the 3Blue1Brown
 * emphasis move). Renders the text AND the mark together, so the band always fits
 * the words — no alignment to guess. `progress` sweeps the highlighter in left→right,
 * as if drawn; the text stays readable on top.
 * ------------------------------------------------------------------------- */
export function MarkerHighlight({
  text,
  color = "orange",
  size = 72,
  at = { x: 960, y: 540 },
  progress = 1,
  style,
}: {
  text: string;
  color?: ConceptColor;
  size?: number;
  at?: Pt; // centre of the phrase in frame coords
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const acc = cc(color);
  const sweep = clamp01(progress);
  return (
    <div style={{ position: "absolute", left: at.x, top: at.y, transform: "translate(-50%, -50%)", fontFamily: t.font.family, ...style }}>
      <span style={{ position: "relative", display: "inline-block", fontSize: size, fontWeight: 700, color: t.color.ink, lineHeight: 1.15, whiteSpace: "nowrap", padding: `0 ${r3(size * 0.09)}px` }}>
        {/* the highlighter band, drawn behind the text and swept in from the left */}
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: r3(size * 0.05),
            height: r3(size * 0.66),
            background: `color-mix(in srgb, ${acc.stroke} 34%, ${t.color.surface})`,
            borderRadius: r3(size * 0.1),
            transformOrigin: "left center",
            transform: `scaleX(${r3(sweep)})`,
            zIndex: 0,
          }}
        />
        {/* The word ARRIVES with its highlight — its text fades in as the sweep
            starts, so a highlighted phrase can never sit on screen before it is
            introduced (e.g. before its context line). */}
        <span style={{ position: "relative", zIndex: 1, opacity: r3(clamp01(sweep / 0.12)) }}>{text}</span>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Stat> — a big number that counts up to its value, with a caption. For the
 * beats that are really one figure ("175B parameters", "92% accuracy"). Drive
 * `progress` 0->1 from the narration to run the count-up.
 * ------------------------------------------------------------------------- */

export function Stat({
  value,
  prefix = "",
  suffix = "",
  label,
  progress = 1,
  decimals,
  accent = "blue",
  size = 220,
  at = { x: 960, y: 500 },
  style,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label?: string;
  /** 0->1 counts the number up from zero. */
  progress?: number;
  /** Decimal places; inferred from `value` when omitted. */
  decimals?: number;
  accent?: ConceptColor;
  size?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const dp = decimals ?? (Number.isInteger(value) ? 0 : 1);
  const shown = (value * p).toFixed(dp);
  // The count-up IS the entrance: it fades in fast and grows from small to full
  // as the number climbs, so there is never a static "0" sitting on screen.
  const appear = clamp01(p / 0.15);
  const scale = r3(0.72 + 0.28 * p);
  return (
    <div
      style={{
        position: "absolute",
        left: at.x,
        top: at.y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: r3(appear),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        fontFamily: t.font.family,
        ...style,
      }}
    >
      <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1, color: cc(accent).stroke, fontVariantNumeric: "tabular-nums" }}>
        {prefix}
        {shown}
        {suffix}
      </div>
      {label && <div style={{ fontSize: r3(size * 0.2), fontWeight: 600, color: t.color.support }}>{label}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Table> — a comparison table: column headers (one concept colour each), an
 * optional left column of row labels, and text body cells, divided by clean
 * rules. Rows reveal top-to-bottom with `progress`; `highlightCol` washes one
 * column. The model composes <Table columns rows /> instead of hand-aligning
 * boxes — the alignment and dividers are guaranteed.
 * ------------------------------------------------------------------------- */

export function Table({
  columns,
  rows,
  rowLabels,
  colColors,
  highlight,
  progress = 1,
  cellW = 360,
  headerH = 96,
  rowH = 88,
  at = { x: 960, y: 540 },
  style,
}: {
  columns: string[]; // column headers
  rows: string[][]; // body rows, each with columns.length text cells
  rowLabels?: string[]; // optional left-column labels (the attributes compared)
  colColors?: ConceptColor[]; // a concept colour per column
  highlight?: { row: number; col: number }[]; // body cells to wash (col 0-based over `columns`)
  /** 0->1 reveals header then rows, top-to-bottom. */
  progress?: number;
  cellW?: number;
  headerH?: number;
  rowH?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const hasLabels = !!rowLabels;
  const bodyLeftCols = hasLabels ? 1 : 0;
  const nCols = columns.length + bodyLeftCols;
  const nRows = rows.length + 1; // + header
  // Auto-fit both axes: shrink columns + rows (and text) so the table overflows
  // neither width nor height, however many columns/rows are passed.
  const rawW = nCols * cellW;
  const rawH = headerH + rows.length * rowH;
  const fit = Math.min(1, 1720 / (rawW || 1), 860 / (rawH || 1));
  const CW = r3(cellW * fit);
  const HH = r3(headerH * fit);
  const RH = r3(rowH * fit);
  const totalW = nCols * CW;
  const totalH = HH + rows.length * RH;
  const left = at.x - totalW / 2;
  const top = at.y - totalH / 2;
  const colX = (ci: number) => ci * CW; // relative to the rounded clipped container
  const reveal = (rowIndex: number) => clamp01(progress * nRows - rowIndex); // header = 0

  const cell = (
    key: string,
    x: number,
    y: number,
    h: number,
    content: string,
    opts: { color: string; weight: number; align: "center" | "flex-start"; border?: string; bg?: string; boxShadow?: string; opacity: number },
  ) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: CW,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: opts.align,
        padding: "0 24px",
        boxSizing: "border-box",
        fontFamily: t.font.family,
        fontSize: r3(30 * fit),
        fontWeight: opts.weight,
        color: opts.color,
        background: opts.bg,
        borderBottom: opts.border,
        boxShadow: opts.boxShadow,
        opacity: r3(opts.opacity),
      }}
    >
      {content}
    </div>
  );

  const nodes: ReactNode[] = [];

  // A quiet neutral wash for the header/label axis, mixed from tokens.
  const neutral = `color-mix(in srgb, ${t.color.border} 9%, ${t.color.surface})`;

  // Header row — each column header carries its own concept wash so the colour
  // identity reads instantly; the corner/label header stays neutral.
  const hRev = reveal(0);
  if (hasLabels) nodes.push(cell("h-corner", colX(0), 0, HH, "", { color: t.color.ink, weight: 700, align: "flex-start", border: `2px solid ${t.color.ink}`, bg: neutral, opacity: hRev }));
  columns.forEach((label, ci) => {
    const color = colColors?.[ci] ? cc(colColors[ci]).stroke : t.color.ink;
    // Header wash is stronger (a mid tint) than the soft body highlight (concept
    // .fill) below it, so the header reads as the header and the highlighted
    // answer stays a distinct, quieter glow.
    const bg = colColors?.[ci]
      ? `color-mix(in srgb, ${cc(colColors[ci]).stroke} 22%, ${t.color.surface})`
      : neutral;
    nodes.push(cell(`h-${ci}`, colX(ci + bodyLeftCols), 0, HH, label, { color, weight: 700, align: "center", border: `2px solid ${t.color.ink}`, bg, opacity: hRev }));
  });

  // Body rows.
  rows.forEach((row, ri) => {
    const y = HH + ri * RH;
    const rowRev = reveal(ri + 1);
    const divider = `1px solid ${t.color.border}`;
    if (hasLabels)
      nodes.push(cell(`l-${ri}`, colX(0), y, RH, rowLabels![ri] ?? "", { color: t.color.support, weight: 600, align: "flex-start", border: divider, bg: neutral, opacity: rowRev }));
    row.forEach((text, ci) => {
      const isHi = highlight?.some((h) => h.row === ri && h.col === ci);
      // Emphasis is just weight: the highlighted cell's text goes bold. Quiet,
      // no ring or wash — it reads as "this one" without shouting.
      nodes.push(cell(`c-${ri}-${ci}`, colX(ci + bodyLeftCols), y, RH, text, {
        color: t.color.ink,
        weight: isHi ? 700 : 500,
        align: "center",
        border: divider,
        opacity: rowRev,
      }));
    });
  });

  // Column dividers LAST, so they stay bold on top of the coloured header cells
  // (columns are the compared entities; the row rules stay light underneath).
  for (let ci = 1; ci < nCols; ci++) {
    nodes.push(
      <div
        key={`vd-${ci}`}
        style={{
          position: "absolute",
          left: colX(ci) - 1,
          top: 0,
          width: 2,
          height: totalH,
          background: t.color.ink,
          opacity: r3(reveal(0)),
        }}
      />,
    );
  }

  // The rounded, clipping frame — its radius is the taste system's own
  // `tokens.radius` (same as Node), so the table belongs to the same family.
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: totalW,
        height: totalH,
        border: `2px solid ${t.color.ink}`,
        borderRadius: t.radius,
        overflow: "hidden",
        opacity: r3(reveal(0)),
        ...style,
      }}
    >
      {nodes}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Matrix> — a grid of value cells (an attention matrix, a weight matrix, a
 * confusion table). Each cell is a heatmap of its value from surface -> the
 * concept colour, with the number shown; cells stagger in with `progress`; a
 * `highlight` cell gets a thick concept border. Row/col labels are optional.
 * The model composes <Matrix values={{...}} /> and never hand-draws a grid.
 * ------------------------------------------------------------------------- */

export function Matrix({
  values,
  color = "blue",
  rowLabels,
  colLabels,
  highlight,
  colorbar = false,
  progress = 1,
  cellSize = 116,
  gap = 8,
  at = { x: 960, y: 560 },
  style,
}: {
  values: number[][]; // rows of values, expected 0..1 for the heatmap
  color?: ConceptColor;
  rowLabels?: string[];
  colLabels?: string[];
  highlight?: { row: number; col: number };
  colorbar?: boolean; // show the value→colour scale as a gradient legend (attention maps)
  /** 0->1 staggers the cells in, row-major. */
  progress?: number;
  cellSize?: number;
  gap?: number;
  /** Grid centre in frame pixels. */
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const stroke = cc(color).stroke;
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  // Auto-fit both axes: shrink the cell + gap so the grid overflows neither
  // width nor height, however many rows/cols the model passes.
  const rawW = cols * cellSize + (cols - 1) * gap;
  const rawH = rows * cellSize + (rows - 1) * gap;
  const fit = Math.min(1, 1680 / (rawW || 1), 820 / (rawH || 1));
  const CS = r3(cellSize * fit);
  const GP = r3(gap * fit);
  const gridW = cols * CS + (cols - 1) * GP;
  const gridH = rows * CS + (rows - 1) * GP;
  const left = at.x - gridW / 2;
  const top = at.y - gridH / 2;
  const total = Math.max(1, rows * cols);

  return (
    <div style={{ position: "absolute", left, top, width: gridW, height: gridH, fontFamily: t.font.family, ...style }}>
      {colLabels?.map((label, c) => (
        <div
          key={`col-${c}`}
          style={{
            position: "absolute",
            left: c * (CS + GP),
            top: -46,
            width: CS,
            textAlign: "center",
            fontSize: 26,
            fontWeight: 600,
            color: t.color.support,
            // Fades in as its column starts filling (first cell of the column).
            opacity: r3(clamp01(progress * total - c)),
          }}
        >
          {label}
        </div>
      ))}
      {rowLabels?.map((label, r) => (
        <div
          key={`row-${r}`}
          style={{
            position: "absolute",
            left: -16,
            top: r * (CS + GP),
            height: CS,
            transform: "translateX(-100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            fontSize: 26,
            fontWeight: 600,
            color: t.color.support,
            // Fades in as its row starts filling (first cell of the row).
            opacity: r3(clamp01(progress * total - r * cols)),
          }}
        >
          {label}
        </div>
      ))}
      {values.map((row, r) =>
        row.map((v, c) => {
          const i = r * cols + c;
          const reveal = clamp01(progress * total - i); // row-major stagger
          const val = clamp01(v);
          const pct = r3(val * 100);
          const hot = val > 0.55;
          const isHi = highlight && highlight.row === r && highlight.col === c;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: c * (CS + GP),
                top: r * (CS + GP),
                width: CS,
                height: CS,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                background: `color-mix(in srgb, ${stroke} ${pct}%, ${t.color.surface})`,
                border: `${isHi ? 4 : 1}px solid ${isHi ? stroke : t.color.border}`,
                color: hot ? "#ffffff" : t.color.ink,
                fontWeight: 600,
                fontSize: r3(CS * 0.26),
                opacity: r3(reveal),
                transform: `scale(${(0.85 + 0.15 * reveal).toFixed(3)})`,
              }}
            >
              {v.toFixed(1)}
            </div>
          );
        }),
      )}
      {colorbar && (
        <div style={{ position: "absolute", left: gridW + r3(40 * fit), top: 0, height: gridH, display: "flex", alignItems: "stretch", gap: r3(10 * fit), opacity: r3(clamp01(progress * 3 - 0.5)) }}>
          <div style={{ width: r3(26 * fit), height: "100%", borderRadius: r3(6 * fit), border: `1px solid ${t.color.border}`, background: `linear-gradient(to top, ${t.color.surface}, ${stroke})` }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: r3(24 * fit), color: t.color.support, fontWeight: 600 }}>
            <span>high</span>
            <span>low</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Arrow> — the colour-matched connector every reference draws between nodes
 * (statquest's weight arrows, bloom's hash arrows). Lives in diagram space:
 * `from`/`to` are pixel points in the enclosing frame. `color` matches its
 * source concept; `label` rides the curve as a chip (statquest's "x -34.4").
 * `progress` (0→1) draws it on — the arrowhead lands as the line arrives.
 * Full-frame overlay SVG, pointer-events off, so several may stack freely.
 * ------------------------------------------------------------------------- */

export function Arrow({
  from,
  to,
  color,
  curve = 0.18,
  variant = "curved",
  width,
  label,
  progress = 1,
  style,
}: {
  from: Pt;
  to: Pt;
  color?: ConceptColor;
  /** Perpendicular bow of the curve, as a fraction of its length. 0 = straight.
      Ignored by elbow / self-loop. */
  curve?: number;
  /** The arrow's shape: "straight" — a plain line · "curved" — a gentle bow
      (default) · "elbow" — right-angle orthogonal route (flowcharts, trees) ·
      "double" — a head at BOTH ends (a mutual relation) · "self-loop" — a loop
      from a node back to itself (pass `from` = the node centre; `to` is ignored) ·
      "dashed" — a dashed line (a weak / optional edge). */
  variant?: "straight" | "curved" | "elbow" | "double" | "self-loop" | "dashed";
  width?: number;
  label?: string;
  progress?: number;
  style?: CSSProperties;
}) {
  const t = tokens;
  const stroke = color ? cc(color).stroke : t.color.border;
  const sw = width ?? t.strokeWidth;
  const p = Number(Math.min(1, Math.max(0, progress)).toFixed(4));
  if (p <= 0) return null; // zero progress -> avoid sub-pixel calculations

  const L = sw * 6; // head length
  const H = sw * 3; // head half-width
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dashed = variant === "dashed";

  // Build the arrow's spine as (1) an SVG path `d` and (2) a densely sampled
  // polyline with cumulative ARC length. Everything downstream — head riding the
  // tip, dash reveal, chip — indexes by arc fraction and is variant-agnostic.
  const build = (pts: Pt[]) => {
    const s: { x: number; y: number; d: number }[] = [{ x: pts[0].x, y: pts[0].y, d: 0 }];
    let a = 0;
    for (let i = 1; i < pts.length; i++) {
      a += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      s.push({ x: pts[i].x, y: pts[i].y, d: a });
    }
    return { samples: s, arc: a || 1 };
  };
  const poly = (pts: Pt[]) => pts.map((pt, i) => `${i ? "L" : "M"} ${r3(pt.x)} ${r3(pt.y)}`).join(" ");

  let d: string;
  let samples: { x: number; y: number; d: number }[];
  let arc: number;

  if (variant === "elbow") {
    // A single right-angle bend: leave the source HORIZONTALLY from its side,
    // turn once, and enter the target VERTICALLY into its top/bottom centre.
    const corners: Pt[] = [from, { x: to.x, y: from.y }, to];
    const pts: Pt[] = [corners[0]];
    for (let c = 1; c < corners.length; c++) {
      const a = corners[c - 1];
      const b = corners[c];
      for (let k = 1; k <= 8; k++) pts.push({ x: a.x + (b.x - a.x) * (k / 8), y: a.y + (b.y - a.y) * (k / 8) });
    }
    ({ samples, arc } = build(pts));
    d = poly(corners);
  } else if (variant === "self-loop") {
    // A loop sitting above the node (from == node centre; `to` ignored).
    const R = 46;
    const cX = from.x;
    const cY = from.y - 78;
    const pts: Pt[] = [];
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI * 0.6 + Math.PI * 1.8 * (i / 30); // gap at the bottom, toward the node
      pts.push({ x: r3(cX + R * Math.cos(a)), y: r3(cY + R * Math.sin(a)) });
    }
    ({ samples, arc } = build(pts));
    d = poly(pts);
  } else {
    // straight / curved / double / dashed -> a quadratic bow (straight when 0).
    const eff = variant === "straight" ? 0 : curve;
    const cx = r3(mx + (-dy / dist) * eff * dist);
    const cy = r3(my + (dx / dist) * eff * dist);
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const s = i / 24;
      const s1 = 1 - s;
      pts.push({ x: s1 * s1 * from.x + 2 * s1 * s * cx + s * s * to.x, y: s1 * s1 * from.y + 2 * s1 * s * cy + s * s * to.y });
    }
    ({ samples, arc } = build(pts));
    d = `M ${r3(from.x)} ${r3(from.y)} Q ${cx} ${cy} ${r3(to.x)} ${r3(to.y)}`;
  }

  const N = samples.length - 1;
  const atArc = (frac: number) => {
    const target = frac * arc;
    for (let i = 1; i <= N; i++) {
      if (samples[i].d >= target) {
        const a = samples[i - 1];
        const b = samples[i];
        const tt = (target - a.d) / ((b.d - a.d) || 1);
        return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt, dx: b.x - a.x, dy: b.y - a.y };
      }
    }
    const b = samples[N];
    const a = samples[N - 1];
    return { x: b.x, y: b.y, dx: b.x - a.x, dy: b.y - a.y };
  };
  const tri = (px: number, py: number, ux: number, uy: number) => {
    const bX = px - ux * L;
    const bY = py - uy * L;
    return `${r3(px)},${r3(py)} ${r3(bX - uy * H)},${r3(bY + ux * H)} ${r3(bX + uy * H)},${r3(bY - ux * H)}`;
  };

  const headFrac = Math.min(0.4, L / arc);
  const minLine = 12 / arc;
  const midPt = atArc(0.5); // chip rides the spine midpoint (all variants)
  const chipOpacity = Number(Math.min(1, Math.max(0, (p - 0.9) / 0.1)).toFixed(4));

  // Heads + line reveal: dash-revealed for the solids (head rides the tip), a
  // whole-line fade for the dashed edge (the reveal-dash would fight its pattern).
  let head = "";
  let tailHead = "";
  let headOpacity: number;
  let drawnPx: number;
  let showLine: boolean;
  let dashArray: string;
  let lineOpacity = 1;

  if (dashed) {
    showLine = true;
    dashArray = `${r3(sw * 3.5)} ${r3(sw * 3)}`;
    drawnPx = arc;
    lineOpacity = Number(Math.min(1, p / 0.7).toFixed(4));
    const end = atArc(1);
    const el = Math.hypot(end.dx, end.dy) || 1;
    head = tri(to.x, to.y, end.dx / el, end.dy / el);
    headOpacity = Number(Math.min(1, Math.max(0, (p - 0.55) / 0.3)).toFixed(4));
  } else {
    dashArray = `${r3(Math.max(0, r3(Math.max(0, p - headFrac)) * arc))} ${arc}`;
    const tip = atArc(p);
    const tl = Math.hypot(tip.dx, tip.dy) || 1;
    head = tri(tip.x, tip.y, tip.dx / tl, tip.dy / tl);
    const drawnFrac = r3(Math.max(0, p - headFrac));
    showLine = p > minLine && drawnFrac > 0;
    drawnPx = drawnFrac * arc;
    headOpacity = Number(Math.min(1, Math.max(0, (p - 2 * headFrac - minLine) / (headFrac || 1))).toFixed(4));
    if (variant === "double") {
      const st = atArc(0);
      const sl = Math.hypot(st.dx, st.dy) || 1;
      tailHead = tri(from.x, from.y, -st.dx / sl, -st.dy / sl);
    }
  }

  return (
    <>
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
          ...style,
        }}
      >
        {/* Real pixel path lengths for the dash — pathLength={1} fractional math
            hits browser sub-pixel rounding and flashes a dot at the start. */}
        {showLine && (
          <path
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap={dashed ? "round" : "butt"}
            strokeDasharray={dashed ? dashArray : `${drawnPx} ${arc}`}
            opacity={lineOpacity}
          />
        )}
      </svg>
      {label && chipOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            left: r3(midPt.x),
            top: r3(midPt.y),
            transform: "translate(-50%, -50%)",
            padding: "4px 10px",
            borderRadius: 8,
            border: `2px solid ${stroke}`,
            background: t.color.surface,
            color: t.color.ink,
            fontFamily: t.font.family,
            fontSize: 15,
            fontWeight: 500,
            whiteSpace: "nowrap",
            opacity: chipOpacity,
          }}
        >
          {label}
        </div>
      )}
      {/* Head on its OWN layer ABOVE the chip; gated by showLine so it never
          renders as a zero-length triangle before the line is established. */}
      {showLine && headOpacity > 0 && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <polygon points={head} fill={stroke} opacity={headOpacity} />
          {tailHead && <polygon points={tailHead} fill={stroke} opacity={headOpacity} />}
        </svg>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Cells> — a linear run of boxed cells: an array (row, indexed), a stack
 * (column) or a queue (row), the data structures algorithms are taught on. Cells
 * are adjacent (contiguous memory reads right); `caps` label a position (a stack
 * "top", a queue "front"/"back"); `highlight` rings one cell. `progress` staggers
 * them in. The model supplies `cells` and never hand-aligns boxes.
 * ------------------------------------------------------------------------- */

export function Cells({
  cells,
  orientation = "row",
  buildFrom = "start",
  container = "none",
  indices = false,
  highlight,
  highlightColor = "blue",
  dim,
  caps = [],
  progress = 1,
  cellSize = 118,
  gap = 6,
  at = { x: 960, y: 540 },
  style,
}: {
  cells: { label: string; color?: ConceptColor }[];
  orientation?: "row" | "column";
  /** Which end fills first. A stack builds "end" (bottom-up, like a bucket); an
      array/queue builds "start" (left→right). */
  buildFrom?: "start" | "end";
  /** A vessel drawn around the cells so the structure reads as itself: "bucket"
      (open-top U — a stack), "channel" (two open-ended rails — a queue), "none"
      (bare cells — an array). */
  container?: "bucket" | "channel" | "none";
  indices?: boolean; // number each cell 0..n-1
  highlight?: number | number[]; // ring one or several cells (e.g. the bits a bloom filter sets)
  highlightColor?: ConceptColor; // wash colour for highlighted cells (default blue)
  dim?: number[]; // cells faded out — "eliminated" (a binary-search half, a pruned branch)
  caps?: { index: number; label: string; color?: ConceptColor }[]; // labelled pointers (top / front / back)
  progress?: number;
  cellSize?: number;
  gap?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = cells.length;
  const row = orientation === "row";
  // Auto-fit both axes: shrink the cell + gap (and the text) by whichever
  // dimension binds, so the run overflows NEITHER width nor height. Overflow is
  // designed out, the same way collisions are.
  const MAX_W = 1760;
  const MAX_H = 900; // usable width / height in the 1920×1080 frame
  const rawLong = n * cellSize + (n - 1) * gap;
  const rawW = row ? rawLong : cellSize;
  const rawH = row ? cellSize : rawLong;
  const fit = Math.min(1, MAX_W / rawW, MAX_H / rawH);
  const CS = r3(cellSize * fit);
  const GP = r3(gap * fit);
  const totalW = row ? n * CS + (n - 1) * GP : CS;
  const totalH = row ? CS : n * CS + (n - 1) * GP;
  const left = at.x - totalW / 2;
  const top = at.y - totalH / 2;
  const cellPos = (i: number) => (row ? { x: i * (CS + GP), y: 0 } : { x: 0, y: i * (CS + GP) });
  // Stagger order: build "end" reveals the last cell first, so a column stack
  // fills from the bottom up. `rev(i)` is the per-cell 0→1 arrival.
  const order = (i: number) => (buildFrom === "end" ? n - 1 - i : i);
  const rev = (i: number) => clamp01(progress * n - order(i));

  // The vessel appears first (fast fade), then the cells fill into it.
  const vessel = clamp01(progress * 5);
  const WALL = 6;
  const PAD = 16;
  const EXT = 46; // how far the queue rails run past the cells (open ends)

  return (
    <div style={{ position: "absolute", left, top, width: totalW, height: totalH, fontFamily: t.font.family, ...style }}>
      {container === "bucket" && (
        // Open-top U: left + right + bottom walls, rounded base — a stack's bucket.
        <div
          style={{
            position: "absolute",
            left: -PAD,
            top: -PAD,
            width: totalW + 2 * PAD,
            height: totalH + 2 * PAD - WALL,
            borderLeft: `${WALL}px solid ${t.color.ink}`,
            borderRight: `${WALL}px solid ${t.color.ink}`,
            borderBottom: `${WALL}px solid ${t.color.ink}`,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 18,
            opacity: r3(vessel),
          }}
        />
      )}
      {container === "channel" && (
        // Two open-ended rails running past both ends — a queue's lane.
        <div
          style={{
            position: "absolute",
            left: -EXT,
            top: -PAD,
            width: totalW + 2 * EXT,
            height: totalH + 2 * PAD,
            borderTop: `${WALL}px solid ${t.color.ink}`,
            borderBottom: `${WALL}px solid ${t.color.ink}`,
            opacity: r3(vessel),
          }}
        />
      )}
      {cells.map((c, i) => {
        const rv = rev(i);
        if (rv <= 0) return null;
        const pos = cellPos(i);
        const isHi = Array.isArray(highlight) ? highlight.includes(i) : highlight === i;
        const isDim = dim?.includes(i);
        const hc = c.color ?? highlightColor;
        const stroke = c.color ? cc(c.color).stroke : isHi ? cc(hc).stroke : t.color.border;
        const fill = c.color ? cc(c.color).fill : isHi ? cc(hc).fill : t.color.surface;
        // A column stack drops each cell in from just above; a row scales in.
        const enter = row ? `scale(${r3(0.85 + 0.15 * rv)})` : `translateY(${r3((1 - rv) * -26)}px)`;
        // Eliminated cells fade back but keep their place.
        const cellOpacity = r3(rv * (isDim ? 0.26 : 1));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: CS,
              height: CS,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `${isHi ? 4 : 3}px solid ${stroke}`,
              background: fill,
              color: t.color.ink,
              borderRadius: r3(10 * fit),
              fontSize: r3(34 * fit),
              fontWeight: 700,
              opacity: cellOpacity,
              transform: enter,
            }}
          >
            {c.label}
          </div>
        );
      })}
      {indices &&
        cells.map((_, i) => {
          const rv = rev(i);
          const pos = cellPos(i);
          return (
            <div
              key={`idx-${i}`}
              style={{
                position: "absolute",
                left: row ? pos.x : -18,
                top: row ? CS + 10 : pos.y,
                width: row ? CS : undefined,
                height: row ? undefined : CS,
                transform: row ? undefined : "translateX(-100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: row ? "center" : "flex-end",
                fontSize: r3(24 * fit),
                fontWeight: 600,
                color: t.color.support,
                opacity: r3(rv),
              }}
            >
              {i}
            </div>
          );
        })}
      {caps.map((cap, k) => {
        const pos = cellPos(cap.index);
        const rv = rev(cap.index);
        const stroke = cc(cap.color ?? "orange").stroke;
        return (
          <div
            key={`cap-${k}`}
            style={{
              position: "absolute",
              left: row ? pos.x + CS / 2 : totalW + 24,
              top: row ? -48 : pos.y + CS / 2,
              transform: row ? "translateX(-50%)" : "translateY(-50%)",
              color: stroke,
              fontSize: r3(24 * fit),
              fontWeight: 700,
              opacity: r3(rv),
              whiteSpace: "nowrap",
            }}
          >
            {cap.label}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Term> — a vocabulary beat: one big term in its accent colour, a rule, and a
 * plain-language definition beneath. The term lands first, the definition a beat
 * later, both on the narration. For "here is the word and what it means" moments.
 * ------------------------------------------------------------------------- */

export function Term({
  term,
  definition,
  words,
  emphasize,
  accent = "blue",
  at = { x: 960, y: 500 },
  style,
}: {
  term: string;
  definition: string;
  words?: SWord[];
  emphasize?: string[]; // words in the definition to lift into the accent colour
  accent?: ConceptColor;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const startT = voiced ? words![0].startInSeconds : 0;
  const defIdx = voiced ? Math.min(words!.length - 1, Math.floor(words!.length * 0.4)) : 0;
  const defT = voiced ? words![defIdx].startInSeconds : 0;
  const termIn = voiced ? clamp01((now - startT) / 0.5) : 1;
  const defIn = voiced ? clamp01((now - defT) / 0.6) : 1;
  const eo = (e: number) => 1 - Math.pow(1 - e, 3);
  const emph = new Set((emphasize ?? []).map((w) => norm(w)));

  return (
    <div
      style={{
        position: "absolute",
        left: at.x,
        top: at.y,
        transform: "translate(-50%, -50%)",
        width: 1180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 40,
        fontFamily: t.font.family,
        textAlign: "center",
        ...style,
      }}
    >
      {/* The term is a first-class outlined card — same radius/stroke as <Node> —
          so it reads as one of Decode's objects, not floating text. It scales +
          fades in; the accent wash lands with it. */}
      <div
        style={{
          padding: "22px 48px",
          border: `${t.strokeWidth}px solid ${cc(accent).stroke}`,
          borderRadius: t.radius,
          background: `color-mix(in srgb, ${cc(accent).fill} ${r3(termIn * 100)}%, ${t.color.surface})`,
          fontSize: 92,
          fontWeight: 800,
          color: cc(accent).stroke,
          letterSpacing: "-0.01em",
          opacity: r3(clamp01(termIn * 1.4)),
          transform: `scale(${r3(0.9 + 0.1 * eo(termIn))})`,
        }}
      >
        {term}
      </div>
      {/* Definition: a readable measure, key words liftable into the accent. */}
      <div style={{ fontSize: 42, fontWeight: 500, lineHeight: 1.45, color: t.color.support, maxWidth: 980, opacity: r3(defIn), transform: `translateY(${r3((1 - eo(defIn)) * 18)}px)` }}>
        {definition.split(/\s+/).map((word, i) => {
          const on = emph.has(norm(word));
          return (
            <span key={i} style={{ color: on ? cc(accent).stroke : t.color.ink, fontWeight: on ? 700 : 500 }}>
              {word}
              {i < definition.split(/\s+/).length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Code> — a code block: a bordered card of monospace lines that reveal top to
 * bottom, with an optional title bar and one highlighted line washed in the
 * accent. No real tokenizer — the model writes the lines and marks the one that
 * matters. For showing the actual snippet a concept comes from.
 * ------------------------------------------------------------------------- */

export function Code({
  lines,
  highlight,
  title,
  accent = "blue",
  progress = 1,
  width = 1200,
  at = { x: 960, y: 540 },
  style,
}: {
  lines: string[];
  highlight?: number; // 0-based line to wash + bold
  title?: string;
  accent?: ConceptColor;
  progress?: number;
  width?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = lines.length;
  const lineH = 52;
  return (
    <div
      style={{
        position: "absolute",
        left: at.x,
        top: at.y,
        transform: "translate(-50%, -50%)",
        width,
        background: t.color.surface,
        border: `3px solid ${t.color.border}`,
        borderRadius: t.radius,
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
        ...style,
      }}
    >
      {title && (
        <div style={{ padding: "14px 26px", borderBottom: `1px solid ${t.color.border}`, fontSize: 24, fontWeight: 700, color: t.color.support, background: `color-mix(in srgb, ${t.color.border} 8%, ${t.color.surface})` }}>{title}</div>
      )}
      {/* The card is full height from the first frame — every line reserves its
          row — so the box never resizes; lines just reveal inside it. */}
      <div style={{ padding: "26px 0" }}>
        {lines.map((ln, i) => {
          // Overlapping cascade (i * 0.7, not i) so lines flow in rather than step.
          const rev = clamp01(progress * (n * 0.7 + 0.3) - i * 0.7);
          const eo = 1 - Math.pow(1 - rev, 3);
          const isHi = highlight === i;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", height: lineH, background: isHi ? `color-mix(in srgb, ${cc(accent).fill} ${r3(eo * 100)}%, transparent)` : "transparent" }}>
              <div style={{ width: 68, textAlign: "right", paddingRight: 22, color: t.color.support, fontSize: 26, opacity: r3(eo) }}>{i + 1}</div>
              <div style={{ fontSize: 30, color: t.color.ink, whiteSpace: "pre", fontWeight: isHi ? 700 : 500, opacity: r3(eo), transform: `translateY(${r3((1 - eo) * 6)}px)` }}>{ln}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Equation> — a formula that reveals term by term, each variable able to carry
 * a concept colour so it ties back to the diagram that named it. No LaTeX — the
 * model supplies ordered `parts`, italic serif math styling is owned here.
 * ------------------------------------------------------------------------- */

export function Equation({
  parts,
  words,
  size = 84,
  at = { x: 960, y: 500 },
  style,
}: {
  parts: { text: string; color?: ConceptColor }[];
  words?: SWord[];
  size?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const startT = voiced ? words![0].startInSeconds : 0;
  const span = voiced ? Math.max(0.8, words![words!.length - 1].startInSeconds - startT) : 0;
  const n = Math.max(1, parts.length);
  return (
    <div
      style={{
        position: "absolute",
        left: at.x,
        top: at.y,
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: `${r3(size * 0.12)}px`,
        fontFamily: "'Cambria Math', 'Latin Modern Math', Georgia, serif",
        fontSize: size,
        fontStyle: "italic",
        ...style,
      }}
    >
      {parts.map((part, i) => {
        const revAt = voiced ? startT + (i / n) * span : 0;
        const rev = voiced ? clamp01((now - revAt) / 0.4) : 1;
        return (
          <span key={i} style={{ color: part.color ? cc(part.color).stroke : t.color.ink, fontWeight: 600, opacity: r3(rev), transform: `translateY(${r3((1 - rev) * size * 0.18)}px)`, display: "inline-block" }}>{part.text}</span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <NumberLine> — a horizontal axis with ticks, on which points and intervals are
 * placed (a value, a range, a threshold). The line draws on left→right, ticks
 * appear as it passes them, points pop in. For 1-D quantities: a number, an
 * inequality, a probability on 0..1.
 * ------------------------------------------------------------------------- */

export function NumberLine({
  domain,
  ticks,
  points = [],
  interval,
  progress = 1,
  y = 560,
  rect = { x: 300, width: 1320 },
  style,
}: {
  domain: [number, number];
  ticks?: number[];
  points?: { value: number; label?: string; color?: ConceptColor }[];
  interval?: [number, number]; // shaded range
  progress?: number;
  y?: number;
  rect?: { x: number; width: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const span = domain[1] - domain[0] || 1;
  const sx = (v: number) => r3(rect.x + ((v - domain[0]) / span) * rect.width);
  const tickVals = ticks ?? d3.ticks(domain[0], domain[1], 8);
  const x0 = rect.x;
  const HL = 15;
  const HW = 8;
  const AX_EXT = HL * 2 + 8; // arrow clears the last tick, not sits on it
  const axisEnd = x0 + rect.width + AX_EXT;
  const lineTip = r3(x0 + (rect.width + AX_EXT) * p);
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        {interval && p > 0.98 && (
          <rect x={sx(interval[0])} y={y - 14} width={r3(sx(interval[1]) - sx(interval[0]))} height={28} fill={cc("blue").fill} />
        )}
        <line x1={x0} y1={y} x2={lineTip} y2={y} stroke={t.color.ink} strokeWidth={3} strokeLinecap="butt" />
        {p > 0.98 && <polygon points={`${r3(axisEnd + 2)},${y} ${r3(axisEnd - HL)},${y - HW} ${r3(axisEnd - HL)},${y + HW}`} fill={t.color.ink} />}
        {tickVals.map((v, i) => {
          const x = sx(v);
          // Fade each tick in as the drawing line sweeps past it, so the 0 tick
          // arrives with the line instead of sitting there from frame one.
          const rev = clamp01((lineTip - x) / 60);
          if (rev <= 0) return null;
          return <line key={`t-${i}`} x1={x} y1={y - 12} x2={x} y2={y + 12} stroke={t.color.ink} strokeWidth={2} opacity={r3(rev)} />;
        })}
        {points.map((pt, i) => {
          const x = sx(pt.value);
          const rev = clamp01((p - 0.9) / 0.1);
          if (rev <= 0) return null;
          return <circle key={`p-${i}`} cx={x} cy={y} r={r3(14 * rev)} fill={cc(pt.color ?? "orange").stroke} />;
        })}
      </svg>
      {tickVals.map((v, i) => {
        const x = sx(v);
        const rev = clamp01((lineTip - x) / 60);
        if (rev <= 0) return null;
        return (
          <div key={`tl-${i}`} style={{ position: "absolute", left: x, top: y + 22, transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: 24, fontWeight: 600, color: t.color.support, opacity: r3(rev) }}>{v}</div>
        );
      })}
      {points.map((pt, i) =>
        pt.label ? (
          <div key={`pl-${i}`} style={{ position: "absolute", left: sx(pt.value), top: y - 64, transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: 28, fontWeight: 700, color: cc(pt.color ?? "orange").stroke, opacity: r3(clamp01((p - 0.9) / 0.1)), whiteSpace: "nowrap" }}>{pt.label}</div>
        ) : null,
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Axes2D> — a coordinate plane with the origin at CENTER and both axes running
 * negative→positive as arrows (unlike <Chart>, whose origin is bottom-left). For
 * vectors, points and geometry in the plane. `vectors` grow from the origin,
 * `points` pop in, an optional light grid gives scale. `progress` builds it.
 * ------------------------------------------------------------------------- */

export function Axes2D({
  xDomain = [-5, 5],
  yDomain = [-5, 5],
  points = [],
  vectors = [],
  grid = true,
  progress = 1,
  xLabel,
  yLabel,
  rect = { x: 560, y: 150, width: 800, height: 800 },
  style,
}: {
  xDomain?: [number, number];
  yDomain?: [number, number];
  points?: { x: number; y: number; label?: string; color?: ConceptColor }[];
  vectors?: { x: number; y: number; label?: string; color?: ConceptColor }[];
  grid?: boolean;
  progress?: number;
  /** Axis titles at the axis ends (x past the right arrow, y above the top arrow),
      anchored to the axes so they can't drift or collide. */
  xLabel?: string;
  yLabel?: string;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const sx = (v: number) => r3(rect.x + ((v - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * rect.width);
  const sy = (v: number) => r3(rect.y + rect.height - ((v - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * rect.height);
  const ox = sx(0);
  const oy = sy(0);
  const HL = 15;
  const HW = 8;
  const gx = d3.range(Math.ceil(xDomain[0]), Math.floor(xDomain[1]) + 1);
  const gy = d3.range(Math.ceil(yDomain[0]), Math.floor(yDomain[1]) + 1);
  // Two beats: the plane (grid + axes) draws on from the origin first (first 35%),
  // THEN the vectors/points build (the rest) — so the axes aren't just there at
  // frame one. Each axis grows outward from the origin in both directions.
  const axesDraw = clamp01(p / 0.35);
  const content = clamp01((p - 0.35) / 0.65);
  // The positive ends run PAST the plot by the arrowhead's clearance, so the head
  // sits beyond the last grid line rather than on it.
  const AX_EXT = HL * 2 + 8;
  const xEnd = rect.x + rect.width + AX_EXT;
  const yEnd = rect.y - AX_EXT;
  const axL = r3(ox - (ox - rect.x) * axesDraw);
  const axR = r3(ox + (xEnd - ox) * axesDraw);
  const ayT = r3(oy - (oy - yEnd) * axesDraw);
  const ayB = r3(oy + (rect.y + rect.height - oy) * axesDraw);
  const axesIn = axesDraw > 0.98;
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        {grid &&
          gx.map((v, i) => (
            <line key={`gx-${i}`} x1={sx(v)} y1={rect.y} x2={sx(v)} y2={rect.y + rect.height} stroke={t.color.border} strokeWidth={1} opacity={r3(0.25 * axesDraw)} />
          ))}
        {grid &&
          gy.map((v, i) => (
            <line key={`gy-${i}`} x1={rect.x} y1={sy(v)} x2={rect.x + rect.width} y2={sy(v)} stroke={t.color.border} strokeWidth={1} opacity={r3(0.25 * axesDraw)} />
          ))}
        {/* axes grow out from the origin; arrowheads land once fully drawn */}
        <line x1={axL} y1={oy} x2={axR} y2={oy} stroke={t.color.ink} strokeWidth={3} />
        <line x1={ox} y1={ayB} x2={ox} y2={ayT} stroke={t.color.ink} strokeWidth={3} />
        {axesIn && <polygon points={`${r3(xEnd + 2)},${oy} ${r3(xEnd - HL)},${oy - HW} ${r3(xEnd - HL)},${oy + HW}`} fill={t.color.ink} />}
        {axesIn && <polygon points={`${ox},${r3(yEnd - 2)} ${r3(ox - HW)},${r3(yEnd + HL)} ${r3(ox + HW)},${r3(yEnd + HL)}`} fill={t.color.ink} />}
        {xLabel && (
          <text x={r3(xEnd)} y={r3(oy + 44)} textAnchor="end" fontFamily={t.font.family} fontSize={30} fontWeight={600} fill={t.color.ink} opacity={r3(axesDraw)}>{xLabel}</text>
        )}
        {yLabel && (
          <text x={r3(ox + 24)} y={r3(yEnd + 6)} textAnchor="start" fontFamily={t.font.family} fontSize={30} fontWeight={600} fill={t.color.ink} opacity={r3(axesDraw)}>{yLabel}</text>
        )}
        {vectors.map((vec, i) => {
          const stroke = cc(vec.color ?? "blue").stroke;
          const tx = r3(ox + (sx(vec.x) - ox) * content);
          const ty = r3(oy + (sy(vec.y) - oy) * content);
          const ang = Math.atan2(ty - oy, tx - ox);
          const a1 = ang + Math.PI - 0.4;
          const a2 = ang + Math.PI + 0.4;
          if (content <= 0.01) return null;
          return (
            <g key={`v-${i}`} opacity={r3(clamp01(content * 2))}>
              <line x1={ox} y1={oy} x2={tx} y2={ty} stroke={stroke} strokeWidth={4} />
              <polygon points={`${tx},${ty} ${r3(tx + 18 * Math.cos(a1))},${r3(ty + 18 * Math.sin(a1))} ${r3(tx + 18 * Math.cos(a2))},${r3(ty + 18 * Math.sin(a2))}`} fill={stroke} />
            </g>
          );
        })}
        {points.map((pt, i) => {
          const rev = clamp01(content * 1.4 - 0.3);
          if (rev <= 0) return null;
          return <circle key={`pt-${i}`} cx={sx(pt.x)} cy={sy(pt.y)} r={r3(12 * rev)} fill={cc(pt.color ?? "orange").fill} stroke={cc(pt.color ?? "orange").stroke} strokeWidth={3} />;
        })}
      </svg>
      {[...vectors, ...points].map((it, i) =>
        it.label ? (
          <div key={`lbl-${i}`} style={{ position: "absolute", left: sx(it.x) + 14, top: sy(it.y) - 40, fontFamily: t.font.family, fontSize: 28, fontWeight: 700, color: cc(it.color ?? "blue").stroke, opacity: r3(clamp01(content * 2 - 0.6)), whiteSpace: "nowrap" }}>{it.label}</div>
        ) : null,
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Timeline> — events along a horizontal line, revealed left→right. Each event
 * is a dot with a label (and optional sub-label), alternating above and below so
 * they never collide. For history, a sequence of releases, a process over time.
 * ------------------------------------------------------------------------- */

export function Timeline({
  events,
  progress = 1,
  y = 540,
  rect = { x: 260, width: 1400 },
  style,
}: {
  events: { label: string; sub?: string; color?: ConceptColor }[];
  progress?: number;
  y?: number;
  rect?: { x: number; width: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const n = Math.max(1, events.length);
  const ex = (i: number) => r3(rect.x + (n === 1 ? rect.width / 2 : (i * rect.width) / (n - 1)));
  const lineTip = r3(rect.x + rect.width * p);
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        <line x1={rect.x} y1={y} x2={lineTip} y2={y} stroke={t.color.border} strokeWidth={3} />
        {events.map((e, i) => {
          const x = ex(i);
          const rev = clamp01(p * n - i);
          if (rev <= 0) return null;
          return <circle key={`d-${i}`} cx={x} cy={y} r={r3(12 * rev)} fill={cc(e.color ?? "blue").stroke} />;
        })}
      </svg>
      {events.map((e, i) => {
        const x = ex(i);
        const rev = clamp01(p * n - i);
        if (rev <= 0) return null;
        const above = i % 2 === 0;
        return (
          <div
            key={`lbl-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: above ? y - 108 : y + 40,
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              fontFamily: t.font.family,
              opacity: r3(rev),
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: cc(e.color ?? "blue").stroke }}>{e.label}</div>
            {e.sub && <div style={{ fontSize: 24, fontWeight: 500, color: t.color.support }}>{e.sub}</div>}
          </div>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Spectrum> — a value on a range: a bar washing from one end colour to the
 * other, a marker sliding to its position, end labels naming the poles. For
 * trade-offs and scales (bias↔variance, cheap↔expensive, a score on 0..1).
 * ------------------------------------------------------------------------- */

export function Spectrum({
  leftLabel,
  rightLabel,
  value,
  markerLabel,
  color = "blue",
  progress = 1,
  y = 540,
  rect = { x: 360, width: 1200 },
  style,
}: {
  leftLabel: string;
  rightLabel: string;
  value: number; // 0..1 position along the bar
  markerLabel?: string;
  color?: ConceptColor;
  progress?: number;
  y?: number;
  rect?: { x: number; width: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const barH = 22;
  const stroke = cc(color).stroke;
  // Two beats: the bar draws on left→right (first 40%), THEN the marker slides to
  // its value (the rest). So the bar builds instead of sitting there at frame one.
  const barGrow = clamp01(p / 0.4);
  const slide = clamp01((p - 0.4) / 0.6);
  const mx = r3(rect.x + rect.width * clamp01(value) * slide);
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        <defs>
          {/* userSpaceOnUse so the gradient stays fixed as the bar grows. */}
          <linearGradient id={`spec-${color}`} gradientUnits="userSpaceOnUse" x1={rect.x} y1="0" x2={rect.x + rect.width} y2="0">
            <stop offset="0" stopColor={cc(color).fill} />
            <stop offset="1" stopColor={stroke} />
          </linearGradient>
        </defs>
        {barGrow > 0.01 && (
          <rect x={rect.x} y={y - barH / 2} width={r3(rect.width * barGrow)} height={barH} rx={barH / 2} fill={`url(#spec-${color})`} stroke={t.color.border} strokeWidth={1} />
        )}
        {slide > 0.01 && <circle cx={mx} cy={y} r={20} fill={t.color.surface} stroke={stroke} strokeWidth={5} opacity={r3(clamp01(slide * 3))} />}
      </svg>
      <div style={{ position: "absolute", left: rect.x, top: y + 34, fontFamily: t.font.family, fontSize: 28, fontWeight: 600, color: t.color.support, opacity: r3(clamp01(barGrow * 2)) }}>{leftLabel}</div>
      <div style={{ position: "absolute", left: rect.x + rect.width, top: y + 34, transform: "translateX(-100%)", fontFamily: t.font.family, fontSize: 28, fontWeight: 600, color: t.color.support, opacity: r3(clamp01(barGrow * 2 - 1)) }}>{rightLabel}</div>
      {markerLabel && slide > 0.01 && (
        <div style={{ position: "absolute", left: mx, top: y - 74, transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: 28, fontWeight: 700, color: stroke, opacity: r3(clamp01(slide * 3 - 0.5)), whiteSpace: "nowrap" }}>{markerLabel}</div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Graph> — a general directed graph: nodes joined by edges of any arrow variant
 * (unlike <Network>, which is strictly layered, or <Tree>, strictly hierarchical).
 * The model places nodes itself (`x`/`y` in frame pixels) or picks `layout="ring"`
 * to drop them evenly on a circle (cycles, state machines). Edges reference nodes
 * by `id`, carry a label (a transition, a weight) and a `variant` (a self-loop to
 * stay in a state, a double head for a mutual relation). Nodes pop in first, then
 * the edges draw on — `progress` (0→1) runs the whole build.
 * ------------------------------------------------------------------------- */

type GraphNode = { id: string; label: string; x?: number; y?: number; color?: ConceptColor };
type GraphEdge = {
  from: string;
  to: string;
  label?: string;
  variant?: "straight" | "curved" | "elbow" | "double" | "self-loop" | "dashed";
  /** Bow of a curved edge; negative bows the other way (route it below vs above). */
  curve?: number;
  color?: ConceptColor;
};

export function Graph({
  nodes,
  edges,
  layout = "positions",
  progress = 1,
  radius = 54,
  rect = { x: 560, y: 170, width: 800, height: 740 },
  style,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** "positions" uses each node's x/y; "ring" drops them evenly on a circle. */
  layout?: "positions" | "ring";
  progress?: number;
  radius?: number; // node circle radius
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const R = radius;

  // Node positions: model-given, or evenly placed on a ring (first node at top).
  const cxR = rect.x + rect.width / 2;
  const cyR = rect.y + rect.height / 2;
  const ringRad = Math.min(rect.width, rect.height) / 2 - R - 24;
  const pos = new Map<string, Pt>();
  nodes.forEach((nd, i) => {
    if (layout === "ring") {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, nodes.length);
      pos.set(nd.id, { x: r3(cxR + ringRad * Math.cos(a)), y: r3(cyR + ringRad * Math.sin(a)) });
    } else {
      pos.set(nd.id, { x: nd.x ?? cxR, y: nd.y ?? cyR });
    }
  });

  // Timing: nodes stagger in early, edges draw on after. Each edge's window ends
  // at p=1 (not past it), so every edge — the last included — reaches full draw
  // and its chip resolves fully.
  const nodeRev = (i: number) => clamp01((p - 0.05 * i) / 0.32);
  const nE = Math.max(1, edges.length);
  const edgeProg = (j: number) => {
    const start = 0.38 + 0.42 * (j / nE);
    return clamp01((p - start) / (1 - start || 1));
  };

  // Trim an edge endpoint back to the node's circle edge so heads sit on the rim.
  const trim = (a: Pt, b: Pt, r: number): Pt => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: r3(a.x + (dx / d) * r), y: r3(a.y + (dy / d) * r) };
  };

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: t.font.family, ...style }}>
      {/* Edges under the nodes. */}
      {edges.map((e, j) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const variant = e.variant ?? (layout === "ring" ? "curved" : "straight");
        if (variant === "self-loop") {
          return <Arrow key={`e-${j}`} from={a} to={a} variant="self-loop" color={e.color} label={e.label} progress={edgeProg(j)} />;
        }
        return (
          <Arrow
            key={`e-${j}`}
            from={trim(a, b, R + 4)}
            to={trim(b, a, R + 4)}
            variant={variant}
            curve={e.curve}
            color={e.color}
            label={e.label}
            progress={edgeProg(j)}
          />
        );
      })}
      {/* Nodes on top. */}
      {nodes.map((nd, i) => {
        const rev = nodeRev(i);
        if (rev <= 0) return null;
        const pt = pos.get(nd.id)!;
        const stroke = cc(nd.color ?? "blue").stroke;
        const fill = cc(nd.color ?? "blue").fill;
        return (
          <div
            key={nd.id}
            style={{
              position: "absolute",
              left: pt.x,
              top: pt.y,
              width: R * 2,
              height: R * 2,
              transform: `translate(-50%, -50%) scale(${r3(0.8 + 0.2 * rev)})`,
              borderRadius: "50%",
              border: `${t.strokeWidth}px solid ${stroke}`,
              background: fill,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 6,
              boxSizing: "border-box",
              color: t.color.ink,
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.05,
              opacity: r3(rev),
            }}
          >
            {nd.label}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <DataTable> — a grid of records the way a database shows them (unlike <Table>,
 * which compares a few options). Rows sit in FIXED slots so nothing reflows, and
 * each row carries a `state` that tells the CRUD story: "match" washes a query
 * result, "new" marks an inserted row, "deleted" strikes and fades a removed one;
 * `updatedCells` bold the fields an UPDATE changed. The model flips these states
 * across the narration to show a SELECT / INSERT / UPDATE / DELETE in place.
 * `progress` (0→1) reveals the rows top-to-bottom on first build.
 * ------------------------------------------------------------------------- */

type RowState = "normal" | "match" | "new" | "deleted";

export function DataTable({
  columns,
  rows,
  colColors,
  rowState,
  updatedCells,
  accent = "blue",
  progress = 1,
  colW = 320,
  headerH = 84,
  rowH = 76,
  at = { x: 960, y: 540 },
  style,
}: {
  columns: string[];
  rows: string[][];
  colColors?: ConceptColor[];
  rowState?: RowState[]; // one per row: normal | match | new | deleted
  updatedCells?: { row: number; col: number }[]; // fields an UPDATE changed
  accent?: ConceptColor;
  progress?: number;
  colW?: number;
  headerH?: number;
  rowH?: number;
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const n = rows.length;
  const nCols = columns.length;
  // Auto-fit both axes so the grid overflows neither width nor height.
  const rawW = nCols * colW;
  const rawH = headerH + n * rowH;
  const fit = Math.min(1, 1720 / (rawW || 1), 860 / (rawH || 1));
  const CW = r3(colW * fit);
  const HH = r3(headerH * fit);
  const RH = r3(rowH * fit);
  const totalW = nCols * CW;
  const totalH = HH + n * RH;
  const left = at.x - totalW / 2;
  const top = at.y - totalH / 2;
  const reveal = (rowIndex: number) => clamp01(progress * (n + 1) - rowIndex); // header = 0
  const isUpd = (r: number, c: number) => !!updatedCells?.some((u) => u.row === r && u.col === c);
  const neutral = `color-mix(in srgb, ${t.color.border} 9%, ${t.color.surface})`;

  const cell = (key: string, x: number, y: number, h: number, node: ReactNode, o: { color: string; weight: number; bg?: string; border?: string; opacity: number; strike?: boolean }) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: CW,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0 24px",
        boxSizing: "border-box",
        fontFamily: t.font.family,
        fontSize: r3(30 * fit),
        fontWeight: o.weight,
        color: o.color,
        background: o.bg,
        borderBottom: o.border,
        textDecoration: o.strike ? "line-through" : undefined,
        opacity: r3(o.opacity),
      }}
    >
      {node}
    </div>
  );

  const nodes: ReactNode[] = [];
  const hRev = reveal(0);
  columns.forEach((label, ci) => {
    const color = colColors?.[ci] ? cc(colColors[ci]).stroke : t.color.ink;
    const bg = colColors?.[ci] ? `color-mix(in srgb, ${cc(colColors[ci]).stroke} 20%, ${t.color.surface})` : neutral;
    nodes.push(cell(`h-${ci}`, ci * CW, 0, HH, label, { color, weight: 700, bg, border: `2px solid ${t.color.ink}`, opacity: hRev }));
  });

  rows.forEach((row, ri) => {
    const y = HH + ri * RH;
    const rRev = reveal(ri + 1);
    const st: RowState = rowState?.[ri] ?? "normal";
    const rowBg =
      st === "match" ? cc(accent).fill : st === "new" ? cc("green").fill : st === "deleted" ? "transparent" : undefined;
    const rowOpacity = st === "deleted" ? rRev * 0.42 : rRev;
    const divider = `1px solid ${t.color.border}`;
    row.forEach((text, ci) => {
      const upd = isUpd(ri, ci);
      nodes.push(
        cell(`c-${ri}-${ci}`, ci * CW, y, RH, text, {
          color: upd ? cc("orange").stroke : t.color.ink,
          weight: upd ? 700 : 500,
          bg: rowBg,
          border: divider,
          opacity: rowOpacity,
          strike: st === "deleted",
        }),
      );
    });
    // "new" rows get an accent bar down their left edge.
    if (st === "new")
      nodes.push(
        <div key={`bar-${ri}`} style={{ position: "absolute", left: 0, top: y, width: 6, height: RH, background: cc("green").stroke, opacity: r3(rRev) }} />,
      );
  });

  // Column dividers on top.
  for (let ci = 1; ci < nCols; ci++)
    nodes.push(<div key={`vd-${ci}`} style={{ position: "absolute", left: ci * CW - 1, top: 0, width: 2, height: totalH, background: t.color.ink, opacity: r3(reveal(0)) }} />);

  return (
    <div style={{ position: "absolute", left, top, width: totalW, height: totalH, border: `2px solid ${t.color.ink}`, borderRadius: t.radius, overflow: "hidden", opacity: r3(reveal(0)), ...style }}>
      {nodes}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Travel> — MOVEMENT: an object travels along a path. `progress` (0→1) is its
 * position along `path` (a polyline of ≥2 points, arc-length parameterised so it
 * moves at a steady speed through corners). It's a labelled chip or a dot — a
 * data packet through a pipeline, a value handed between stages, a token walking
 * a route. `showPath` draws the faint route it follows; `trail` leaves a fading
 * wake behind it. The atom of motion — everything that moves composes this.
 * ------------------------------------------------------------------------- */

export function Travel({
  path,
  progress = 1,
  label,
  color = "blue",
  shape = "chip",
  size = 56,
  showPath = false,
  trail = false,
  style,
}: {
  path: Pt[]; // waypoints; the object moves from path[0] to the last point
  progress?: number; // 0→1 position along the path
  label?: string; // text on the moving chip (shape="chip")
  color?: ConceptColor;
  shape?: "chip" | "dot";
  size?: number; // dot diameter
  showPath?: boolean; // draw the faint route behind it
  trail?: boolean; // leave a fading wake up to the current position
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const cum = [0];
  let arc = 0;
  for (let i = 1; i < path.length; i++) {
    arc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    cum.push(arc);
  }
  arc = arc || 1;
  const at = (frac: number): Pt => {
    const target = frac * arc;
    for (let i = 1; i < path.length; i++) {
      if (cum[i] >= target) {
        const a = path[i - 1];
        const b = path[i];
        const tt = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
      }
    }
    return path[path.length - 1];
  };
  const pos = at(p);
  const stroke = cc(color).stroke;
  const fill = cc(color).fill;
  const pathD = path.map((pt, i) => `${i ? "L" : "M"} ${r3(pt.x)} ${r3(pt.y)}`).join(" ");

  return (
    <>
      {(showPath || trail) && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
          {showPath && <path d={pathD} fill="none" stroke={t.color.border} strokeWidth={2} strokeDasharray="6 8" opacity={0.5} />}
          {trail && p > 0 && <path d={pathD} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray={`${r3(p)} ${r3(1 - p + 0.0001)}`} opacity={0.32} />}
        </svg>
      )}
      <div style={{ position: "absolute", left: r3(pos.x), top: r3(pos.y), transform: "translate(-50%, -50%)", ...style }}>
        {shape === "dot" ? (
          <div style={{ width: size, height: size, borderRadius: "50%", background: fill, border: `${t.strokeWidth}px solid ${stroke}` }} />
        ) : (
          <div style={{ padding: "8px 16px", borderRadius: t.radius, background: fill, border: `${t.strokeWidth}px solid ${stroke}`, color: t.color.ink, fontFamily: t.font.family, fontSize: 22, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Pointer> — MOVEMENT: a caret that points AT a spot, the way you point at a
 * board. Its tip sits on `at` and it carries an optional label ("i", a step, a
 * name). Move it by driving `at` between element positions across the narration
 * and it becomes the classic teaching pointer — the cursor that walks an array,
 * a tree, a pipeline, indicating "we are here now". The atom of TRACE.
 * ------------------------------------------------------------------------- */

export function Pointer({
  at,
  label,
  color = "orange",
  direction = "up",
  size = 30,
  style,
}: {
  at: Pt; // the point the caret's tip touches
  label?: string;
  color?: ConceptColor;
  direction?: "up" | "down" | "left" | "right";
  size?: number; // caret length from base to tip
  style?: CSSProperties;
}) {
  const t = tokens;
  const stroke = cc(color).stroke;
  const w = size * 0.62; // half-base
  // A CSS triangle whose APEX points in `direction`; the container is placed so
  // that apex lands exactly on `at`.
  const tri: Record<typeof direction, CSSProperties> = {
    up: { borderLeft: `${w}px solid transparent`, borderRight: `${w}px solid transparent`, borderBottom: `${size}px solid ${stroke}` },
    down: { borderLeft: `${w}px solid transparent`, borderRight: `${w}px solid transparent`, borderTop: `${size}px solid ${stroke}` },
    left: { borderTop: `${w}px solid transparent`, borderBottom: `${w}px solid transparent`, borderRight: `${size}px solid ${stroke}` },
    right: { borderTop: `${w}px solid transparent`, borderBottom: `${w}px solid transparent`, borderLeft: `${size}px solid ${stroke}` },
  };
  const vertical = direction === "up" || direction === "down";
  const flexDir: CSSProperties["flexDirection"] = direction === "up" ? "column" : direction === "down" ? "column-reverse" : direction === "left" ? "row" : "row-reverse";
  // Offset the whole cluster so the caret's apex sits on `at`.
  const tx = direction === "left" ? "0" : direction === "right" ? "-100%" : "-50%";
  const ty = direction === "up" ? "0" : direction === "down" ? "-100%" : "-50%";
  return (
    <div style={{ position: "absolute", left: r3(at.x), top: r3(at.y), transform: `translate(${tx}, ${ty})`, display: "flex", flexDirection: flexDir, alignItems: "center", gap: 8, ...style }}>
      <div style={{ width: 0, height: 0, ...tri[direction] }} />
      {label && <div style={{ fontFamily: t.font.family, fontSize: 24, fontWeight: 700, color: stroke, whiteSpace: "nowrap", writingMode: vertical ? undefined : undefined }}>{label}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Morph> — MOVEMENT: one thing BECOMES another. Renders `before` at progress 0
 * and `after` at progress 1, transitioning between them: "flip" (a card turning
 * over — encode/decode, reveal), "fade" (a crossfade), "slide" (out up, in up).
 * The children are any nodes — two boxes, two labels, two little diagrams — so it
 * transforms whatever you give it. The atom of transformation / before→after.
 * ------------------------------------------------------------------------- */

export function Morph({
  before,
  after,
  progress = 1,
  mode = "flip",
  at = { x: 960, y: 540 },
  style,
}: {
  before: ReactNode;
  after: ReactNode;
  progress?: number; // 0 = before, 1 = after
  mode?: "flip" | "fade" | "slide";
  at?: Pt;
  style?: CSSProperties;
}) {
  const p = clamp01(progress);
  const face = (node: ReactNode, isAfter: boolean) => {
    let s: CSSProperties = { position: "absolute", left: 0, top: 0 };
    if (mode === "fade") {
      s = { ...s, transform: "translate(-50%, -50%)", opacity: r3(isAfter ? clamp01((p - 0.4) / 0.6) : clamp01((0.6 - p) / 0.6)) };
    } else if (mode === "slide") {
      const off = isAfter ? (1 - clamp01((p - 0.5) / 0.5)) * 40 : -clamp01(p / 0.5) * 40;
      s = { ...s, transform: `translate(-50%, calc(-50% + ${r3(off)}px))`, opacity: r3(isAfter ? clamp01((p - 0.5) / 0.5) : clamp01((0.5 - p) / 0.5)) };
    } else {
      // flip: before turns 0→90°, after turns -90°→0, swapping at the edge-on midpoint.
      const rot = isAfter ? -90 * (1 - clamp01((p - 0.5) / 0.5)) : 90 * clamp01(p / 0.5);
      const shown = isAfter ? p >= 0.5 : p < 0.5;
      s = { ...s, transform: `translate(-50%, -50%) perspective(900px) rotateY(${r3(rot)}deg)`, opacity: shown ? 1 : 0, backfaceVisibility: "hidden" };
    }
    return <div style={s}>{node}</div>;
  };
  return (
    <div style={{ position: "absolute", left: at.x, top: at.y, ...style }}>
      {face(before, false)}
      {face(after, true)}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * <Flow> — MOVEMENT: continuous motion ALONG a path — data streaming down a wire,
 * current in a circuit, a gradient flowing back. Reads the frame clock itself and
 * loops: "dashes" slide a dashed line along the path (direction + rate), or
 * "particles" send evenly-spaced dots down it. `speed` is fractions of the path
 * per second; `active` gates it on/off from the narration.
 * ------------------------------------------------------------------------- */

export function Flow({
  path,
  mode = "dashes",
  color = "blue",
  speed = 0.4,
  count = 4,
  width = 5,
  active = true,
  style,
}: {
  path: Pt[];
  mode?: "dashes" | "particles";
  color?: ConceptColor;
  speed?: number; // fractions of the path per second
  count?: number; // particles (mode="particles")
  width?: number; // stroke / dot size
  active?: boolean;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const stroke = cc(color).stroke;
  if (!active) return null;

  const cum = [0];
  let arc = 0;
  for (let i = 1; i < path.length; i++) {
    arc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    cum.push(arc);
  }
  arc = arc || 1;
  const at = (frac: number): Pt => {
    const target = ((frac % 1) + 1) % 1 * arc;
    for (let i = 1; i < path.length; i++) {
      if (cum[i] >= target) {
        const a = path[i - 1];
        const b = path[i];
        const tt = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
      }
    }
    return path[path.length - 1];
  };
  const d = path.map((pt, i) => `${i ? "L" : "M"} ${r3(pt.x)} ${r3(pt.y)}`).join(" ");

  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", ...style }}>
      {mode === "dashes" ? (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray="14 18"
          strokeDashoffset={r3(-now * speed * arc)}
          opacity={0.9}
        />
      ) : (
        Array.from({ length: count }).map((_, i) => {
          const pt = at(now * speed + i / count);
          return <circle key={i} cx={r3(pt.x)} cy={r3(pt.y)} r={width + 2} fill={stroke} />;
        })
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * <Venn> — overlapping sets. Two or three translucent circles whose overlap
 * reads as the intersection (an optional `overlapLabel` names it). Each set owns
 * a concept colour; `progress` fades them in. For set relationships, shared vs
 * unique, "both / either / neither".
 * ------------------------------------------------------------------------- */

export function Venn({
  sets,
  overlapLabel,
  progress = 1,
  rect = { x: 560, y: 190, width: 800, height: 660 },
  style,
}: {
  sets: { label: string; color?: ConceptColor }[]; // 2 or 3
  overlapLabel?: string;
  progress?: number;
  rect?: { x: number; y: number; width: number; height: number };
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const two = sets.length <= 2;
  const R = two ? 210 : 190;
  const off = two ? 125 : 150;
  const palette: ConceptColor[] = ["blue", "orange", "green"];
  const centers = two
    ? [{ x: cx - off, y: cy }, { x: cx + off, y: cy }]
    : [{ x: cx, y: cy - off * 0.85 }, { x: cx - off, y: cy + off * 0.7 }, { x: cx + off, y: cy + off * 0.7 }];
  // Where each set's own label sits (pushed outward from the cluster centre).
  const labelPos = (i: number) => {
    const c = centers[i];
    const dx = c.x - cx;
    const dy = c.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return { x: c.x + (dx / d) * (R * 0.7) - (two ? 0 : 0), y: c.y + (dy / d) * (R * 0.7) };
  };
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        {sets.map((s, i) => {
          const c = centers[i];
          const col = cc(s.color ?? palette[i % palette.length]);
          const rev = clamp01(p * 1.6 - i * 0.25);
          if (rev <= 0) return null;
          return <circle key={i} cx={r3(c.x)} cy={r3(c.y)} r={r3(R * (0.9 + 0.1 * rev))} fill={col.fill} fillOpacity={0.55} stroke={col.stroke} strokeWidth={4} opacity={r3(rev)} />;
        })}
      </svg>
      {sets.map((s, i) => {
        const lp = labelPos(i);
        const rev = clamp01(p * 1.6 - i * 0.25);
        return (
          <div key={`l-${i}`} style={{ position: "absolute", left: lp.x, top: two ? cy - R - 44 : lp.y, transform: "translate(-50%, -50%)", fontFamily: t.font.family, fontSize: 32, fontWeight: 700, color: cc(s.color ?? palette[i % palette.length]).stroke, opacity: r3(rev), whiteSpace: "nowrap" }}>{s.label}</div>
        );
      })}
      {overlapLabel && (
        <div style={{ position: "absolute", left: two ? cx : cx, top: two ? cy : cy + 10, transform: "translate(-50%, -50%)", fontFamily: t.font.family, fontSize: 26, fontWeight: 700, color: t.color.ink, opacity: r3(clamp01(p * 2 - 1)), whiteSpace: "nowrap", textAlign: "center" }}>{overlapLabel}</div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * <Meter> — a value on a dial. A 180° gauge with a track, a coloured fill up to
 * the value, a needle, and the reading. `progress` sweeps the needle from min to
 * the value. For a single measurement on a scale — utilisation, a score, load.
 * ------------------------------------------------------------------------- */

export function Meter({
  value,
  min = 0,
  max = 100,
  label,
  suffix = "",
  color = "blue",
  progress = 1,
  size = 300,
  at = { x: 960, y: 620 },
  style,
}: {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  suffix?: string;
  color?: ConceptColor;
  progress?: number;
  size?: number; // outer radius
  at?: Pt;
  style?: CSSProperties;
}) {
  const t = tokens;
  const p = clamp01(progress);
  const stroke = cc(color).stroke;
  const frac = clamp01((value - min) / (max - min || 1));
  const shown = frac * p;
  const R = size;
  const arcGen = d3.arc();
  // Top semicircle: d3 angle -π/2 (9 o'clock) → +π/2 (3 o'clock) through the top.
  const track = arcGen({ innerRadius: R - 34, outerRadius: R, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 }) ?? "";
  const fillArc = arcGen({ innerRadius: R - 34, outerRadius: R, startAngle: -Math.PI / 2, endAngle: -Math.PI / 2 + shown * Math.PI }) ?? "";
  const theta = -Math.PI / 2 + shown * Math.PI;
  const nx = at.x + (R - 44) * Math.sin(theta);
  const ny = at.y - (R - 44) * Math.cos(theta);
  const reading = (min + (max - min) * shown).toFixed(0);
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", ...style }}>
        <path d={track} transform={`translate(${at.x}, ${at.y})`} fill={`color-mix(in srgb, ${t.color.border} 22%, ${t.color.surface})`} />
        <path d={fillArc} transform={`translate(${at.x}, ${at.y})`} fill={stroke} />
        <line x1={at.x} y1={at.y} x2={r3(nx)} y2={r3(ny)} stroke={t.color.ink} strokeWidth={6} strokeLinecap="round" />
        <circle cx={at.x} cy={at.y} r={14} fill={t.color.ink} />
      </svg>
      <div style={{ position: "absolute", left: at.x, top: at.y + r3(size * 0.2), transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: r3(size * 0.24), fontWeight: 800, color: stroke, fontVariantNumeric: "tabular-nums" }}>{reading}{suffix}</div>
      {label && <div style={{ position: "absolute", left: at.x, top: at.y + r3(size * 0.49), transform: "translateX(-50%)", fontFamily: t.font.family, fontSize: r3(size * 0.1), fontWeight: 600, color: t.color.support, whiteSpace: "nowrap" }}>{label}</div>}
    </>
  );
}
