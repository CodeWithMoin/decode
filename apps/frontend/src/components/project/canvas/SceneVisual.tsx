"use client";

import { useMemo } from "react";
import { clamp01, cos, ease, seg, sin } from "@/lib/derive";
import type { Scene } from "@/lib/types";

/**
 * Scene visuals.
 *
 * In the handoff prototype this region was deliberately abstract — mono chips
 * and a caption — because the design tool could not animate. This is that slot,
 * filled: one renderer per animation kind, every one driven by `p`, the
 * scene's own progress (0…1) derived from the playhead.
 *
 * Because they are progress-driven rather than time-driven, scrubbing the
 * timeline scrubs the animation, and a paused playhead holds a legible frame.
 * Nothing here animates on mount.
 */

const INK = "var(--scene-ink, #BDBDBD)";
const DIM = "var(--scene-dim, #8E8E8E)";
const CAP = "var(--scene-cap, #F2F2F2)";

/**
 * Diagram surfaces sit a step brighter than the spec's canvas chips.
 * The chip tokens (#1D1D22 on #0E0E10) were sized for small labelled pills
 * where the text carries the meaning; at diagram scale that pairing is a
 * ~1.1:1 contrast ratio and whole shapes disappear into the background.
 */
const SURF = "#232323";
const EDGE = "#484848";

/** The original chip tokens, still correct for the small labelled pills. */
const CHIP = "#1C1C1C";
const FAINT = "#303030";

export function SceneVisual({
  scene,
  p,
  pick,
}: {
  scene: Scene;
  /** Progress through this scene, 0…1. */
  p: number;
  /** Resolved Motion Designer option, when the crew offered a choice. */
  pick?: "A" | "B";
}) {
  const t = clamp01(p);

  switch (scene.anim) {
    case "Fade sequence":
      return <FadeSequence p={t} />;
    case "Token flow":
      return <TokenFlow p={t} />;
    case "Equation build":
      return pick === "B" ? <HeatMap p={t} /> : <EquationBuild p={t} />;
    case "Head split":
      return <HeadSplit p={t} />;
    case "Wave overlay":
      return pick === "B" ? <Fingerprints p={t} /> : <WaveOverlay p={t} />;
    case "Stack build":
      return <StackBuild p={t} />;
    case "Chart reveal":
      return <ChartReveal p={t} />;
    case "Zoom out":
      return <ZoomOut p={t} />;
    default:
      return <Chips scene={scene} />;
  }
}

/** Shared frame: a 720×300 viewBox that scales into whatever space it gets. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 720 300"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/* ================================================================== */
/* 01 · Fade sequence — memory that fades by word forty                */
/* ================================================================== */

function FadeSequence({ p }: { p: number }) {
  const n = 7;
  return (
    <Stage>
      {Array.from({ length: n }, (_, i) => {
        const x = 70 + i * 96;
        // The chain grows left to right; as it does, early states fade.
        const born = ease(seg(p, i * 0.1, i * 0.1 + 0.16));
        const decay = clamp01((p - (i * 0.1 + 0.3)) * 1.4);
        const opacity = born * (1 - decay * 0.85);
        const size = 44 - decay * 10;
        return (
          <g key={i} opacity={opacity}>
            {i > 0 && (
              <line
                x1={x - 96 + size / 2 + 6}
                y1={150}
                x2={x - size / 2 - 6}
                y2={150}
                stroke={EDGE}
                strokeWidth={1.5}
                opacity={born}
              />
            )}
            <rect
              x={x - size / 2}
              y={150 - size / 2}
              width={size}
              height={size}
              rx={10}
              fill={SURF}
              stroke={i === n - 1 ? "var(--accent)" : EDGE}
              strokeWidth={i === n - 1 ? 1.5 : 1}
            />
            <text
              x={x}
              y={155}
              fill={i === n - 1 ? CAP : INK}
              fontSize={13}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              h{i === n - 1 ? "ₙ" : i + 1}
            </text>
          </g>
        );
      })}

      {/* The single summary vector, shrinking as it travels. */}
      <rect
        x={54 + ease(p) * 560}
        y={214}
        width={Math.max(10, 66 - ease(p) * 52)}
        height={10}
        rx={5}
        fill="var(--accent)"
        opacity={0.85}
      />
      <text
        x={360}
        y={252}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        textAnchor="middle"
      >
        ONE FIXED-SIZE SUMMARY
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 02 · Token flow — every word asks, every word answers                */
/* ================================================================== */

function TokenFlow({ p }: { p: number }) {
  const keys = [0, 1, 2, 3, 4];
  const sweep = seg(p, 0.35, 1);
  const lit = Math.floor(sweep * keys.length);

  return (
    <Stage>
      {/* the token */}
      <rect
        x={40}
        y={126}
        width={92}
        height={48}
        rx={12}
        fill={SURF}
        stroke={EDGE}
      />
      <text
        x={86}
        y={156}
        fill={CAP}
        fontSize={14}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
      >
        token
      </text>

      {/* three learned projections */}
      {["Q", "K", "V"].map((l, i) => {
        const y = 80 + i * 70;
        const a = ease(seg(p, 0.08 + i * 0.07, 0.34 + i * 0.07));
        const isQ = l === "Q";
        return (
          <g key={l} opacity={a}>
            <path
              d={`M132 150 C 180 150, 180 ${y}, 226 ${y}`}
              stroke={isQ ? "var(--accent)" : EDGE}
              strokeWidth={1.5}
              fill="none"
            />
            <rect
              x={226}
              y={y - 19}
              width={44}
              height={38}
              rx={10}
              fill={isQ ? "var(--accent)" : SURF}
              stroke={isQ ? "var(--accent)" : EDGE}
            />
            <text
              x={248}
              y={y + 5}
              fill={isQ ? "#fff" : INK}
              fontSize={14}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {l}
            </text>
          </g>
        );
      })}

      {/* the query sweeping across other tokens' keys */}
      {keys.map((i) => {
        const x = 360 + i * 66;
        const on = i < lit;
        return (
          <g key={i}>
            <rect
              x={x}
              y={128}
              width={50}
              height={44}
              rx={10}
              fill={on ? "var(--accent-wash)" : SURF}
              stroke={on ? "var(--accent)" : EDGE}
              style={{ transition: "fill .2s ease, stroke .2s ease" }}
            />
            <text
              x={x + 25}
              y={155}
              fill={on ? CAP : DIM}
              fontSize={11}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              k{i + 1}
            </text>
          </g>
        );
      })}

      {sweep > 0 && sweep < 1 && (
        <line
          x1={352 + sweep * 330}
          y1={112}
          x2={352 + sweep * 330}
          y2={188}
          stroke="var(--accent)"
          strokeWidth={2}
          opacity={0.9}
        />
      )}

      <text
        x={470}
        y={228}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        textAnchor="middle"
      >
        QUERY · MATCHES KEYS · READS VALUES
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 03A · Equation build — term by term                                  */
/* ================================================================== */

function EquationBuild({ p }: { p: number }) {
  // Laid out with tspans rather than hand-placed x offsets.
  //
  // Each term used to carry a hardcoded width and the next one started at
  // `x += w + 10`. Those widths were guesses and they were short: "softmax(" is
  // eight monospace characters, ~144 user units at this size, but was allotted
  // 108 — so the closing terms climbed backwards into it and the equation
  // rendered as "softmaxQK". Every term after the first inherited the error.
  //
  // tspans advance by the font's real metrics, so the equation stays correct if
  // the mono face, its fallback, or the size ever changes.
  const terms = [
    { t: "softmax(", lit: false },
    { t: "QKᵀ", lit: false },
    { t: "/ √dₖ", lit: true },
    { t: ")", lit: false },
    { t: "· V", lit: false },
  ];
  // 25, not 30: at 30 the natural run ends around x=544 and collides with the
  // score field that starts at 508.
  const SIZE = 25;

  return (
    <Stage>
      {/* pairwise score field forming behind the equation */}
      {Array.from({ length: 8 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => {
          const idx = r * 8 + c;
          const a = ease(seg(p, 0.05 + idx * 0.004, 0.4 + idx * 0.004));
          const v = Math.abs(sin(r * 1.7 + c * 0.9));
          return (
            <rect
              key={`${r}-${c}`}
              x={508 + c * 22}
              y={64 + r * 22}
              width={19}
              height={19}
              rx={3}
              fill="var(--accent)"
              opacity={a * (0.1 + v * 0.55)}
            />
          );
        }),
      )}

      <text
        x={148}
        y={168}
        fontSize={SIZE}
        fontFamily="var(--font-mono)"
        fill={CAP}
      >
        {terms.map((term, i) => (
          <tspan
            key={term.t}
            dx={i === 0 ? 0 : 10}
            fill={term.lit ? "var(--color-accent-lit)" : CAP}
            opacity={ease(seg(p, i * 0.15, i * 0.15 + 0.2))}
          >
            {term.t}
          </tspan>
        ))}
      </text>

      <text
        x={148}
        y={216}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        opacity={ease(seg(p, 0.5, 0.7))}
      >
        SCALING KEEPS SOFTMAX GRADIENTS ALIVE
      </text>
    </Stage>
  );
}

/* 03B · Heat-map forms, then softens — the Motion Designer's pick */
function HeatMap({ p }: { p: number }) {
  const n = 12;
  const soften = seg(p, 0.55, 1);
  return (
    <Stage>
      {Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => {
          const idx = r * n + c;
          const born = ease(seg(p, idx * 0.0022, 0.5 + idx * 0.0022));
          const raw = Math.abs(sin(r * 1.3 + c * 0.7) * cos(c * 0.4));
          // softmax softening: peaks flatten toward a diffuse average
          const v = raw * (1 - soften) + (raw * 0.35 + 0.2) * soften;
          return (
            <rect
              key={`${r}-${c}`}
              x={252 + c * 18}
              y={42 + r * 18}
              width={16}
              height={16}
              rx={3}
              fill="var(--accent)"
              opacity={born * (0.08 + v * 0.8)}
            />
          );
        }),
      )}
      <text
        x={360}
        y={286}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        textAnchor="middle"
      >
        {soften > 0.2 ? "SOFTMAX · WEIGHTS, NOT SCORES" : "QKᵀ · EVERY PAIR AT ONCE"}
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 04 · Head split — eight heads, eight relationships                   */
/* ================================================================== */

function HeadSplit({ p }: { p: number }) {
  const split = ease(seg(p, 0.1, 0.55));
  const join = ease(seg(p, 0.78, 1));
  const heads = 8;

  const CENTRE = 360;
  const PITCH = 76;
  const WIDE = 344; // the single wide block, before it divides
  const SLIM = 56; // one head, after
  const GRID = 4;
  const CELL = 10;

  return (
    <Stage>
      {Array.from({ length: heads }, (_, i) => {
        // Out from the centre as it splits, back to it as it concatenates.
        const target = CENTRE + (i - (heads - 1) / 2) * PITCH;
        const spread = split * (1 - join);
        const cx = CENTRE + (target - CENTRE) * spread;
        const w = WIDE + (SLIM - WIDE) * spread;

        // Before the split there is one block, so only draw the first.
        if (spread < 0.02 && i > 0) return null;

        const lit = i === 2;
        const gridW = GRID * CELL;

        return (
          <g key={i}>
            <rect
              x={cx - w / 2}
              y={64}
              width={w}
              height={132}
              rx={12}
              fill={SURF}
              stroke={lit ? "var(--accent)" : EDGE}
              strokeWidth={lit ? 1.6 : 1}
            />

            {/* Each head resolves its own attention pattern. */}
            {spread > 0.12 &&
              Array.from({ length: GRID }, (_, r) =>
                Array.from({ length: GRID }, (_, c) => (
                  <rect
                    key={`${r}-${c}`}
                    x={cx - gridW / 2 + c * CELL}
                    y={96 + r * CELL}
                    width={CELL - 2}
                    height={CELL - 2}
                    rx={2}
                    fill={lit ? "var(--accent)" : INK}
                    opacity={
                      ease(seg(spread, 0.12, 0.7)) *
                      (0.14 + Math.abs(sin(i * 2.1 + r * 1.4 + c)) * 0.72)
                    }
                  />
                )),
              )}

            <text
              x={cx}
              y={218}
              fill={lit ? "var(--color-accent-lit)" : DIM}
              fontSize={11}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              opacity={spread}
            >
              h{i + 1}
            </text>
          </g>
        );
      })}

      <text
        x={360}
        y={258}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        textAnchor="middle"
      >
        {join > 0.25 ? "CONCAT · PROJECT" : "EIGHT SUBSPACES, IN PARALLEL"}
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 05A · Wave overlay — order, restored by sine waves                   */
/* ================================================================== */

function WaveOverlay({ p }: { p: number }) {
  const waves = [1, 2, 4, 8];
  const path = (freq: number, amp: number, phase: number) => {
    const pts: string[] = [];
    for (let x = 0; x <= 640; x += 8) {
      const y =
        190 + sin((x / 640) * Math.PI * 2 * freq + phase) * amp;
      // Rounded, and not only for tidiness: Node's Math.sin and the browser's
      // can disagree in the final ULP, which makes the server and client emit
      // different `d` strings and trips a hydration mismatch. Two decimals is
      // far below one device pixel at this viewBox.
      pts.push(`${x === 0 ? "M" : "L"}${40 + x} ${y.toFixed(2)}`);
    }
    return pts.join(" ");
  };

  return (
    <Stage>
      {/* identical tokens, indistinguishable without position */}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <rect
            x={44 + i * 80}
            y={62}
            width={64}
            height={44}
            rx={10}
            fill={SURF}
            stroke={EDGE}
          />
          <text
            x={76 + i * 80}
            y={90}
            fill={DIM}
            fontSize={11}
            fontFamily="var(--font-mono)"
            textAnchor="middle"
          >
            pos {i}
          </text>
        </g>
      ))}

      {waves.map((f, i) => {
        const a = ease(seg(p, i * 0.18, i * 0.18 + 0.3));
        return (
          <path
            key={f}
            d={path(f, 34 - i * 6, p * Math.PI * 2)}
            stroke={i === 0 ? "var(--accent)" : INK}
            strokeWidth={1.5}
            fill="none"
            opacity={a * (i === 0 ? 0.9 : 0.35)}
          />
        );
      })}

      <text
        x={360}
        y={272}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        textAnchor="middle"
      >
        GEOMETRIC FREQUENCIES · UNIQUE SIGNATURE
      </text>
    </Stage>
  );
}

/* 05B · Tokens with striped fingerprints — the Motion Designer's pick */
function Fingerprints({ p }: { p: number }) {
  return (
    <Stage>
      {Array.from({ length: 8 }, (_, i) => {
        const a = ease(seg(p, i * 0.09, i * 0.09 + 0.3));
        return (
          <g key={i}>
            <rect
              x={44 + i * 80}
              y={72}
              width={64}
              height={130}
              rx={12}
              fill={SURF}
              stroke={i === 1 ? "var(--accent)" : EDGE}
              strokeWidth={i === 1 ? 1.5 : 1}
            />
            {Array.from({ length: 10 }, (_, r) => (
              <rect
                key={r}
                x={52 + i * 80}
                y={84 + r * 12}
                width={48}
                height={7}
                rx={2}
                fill={i === 1 ? "var(--accent)" : INK}
                opacity={
                  a *
                  (0.15 +
                    Math.abs(sin(i * 0.9 + r * (0.4 + i * 0.06))) * 0.7)
                }
              />
            ))}
            <text
              x={76 + i * 80}
              y={224}
              fill={DIM}
              fontSize={10}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {i}
            </text>
          </g>
        );
      })}
      <text
        x={360}
        y={264}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        textAnchor="middle"
      >
        SAME TOKEN, DIFFERENT FINGERPRINT
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 06 · Stack build — read the source, write the answer                 */
/* ================================================================== */

function StackBuild({ p }: { p: number }) {
  const rows = 6;
  return (
    <Stage>
      {Array.from({ length: rows }, (_, i) => {
        const enc = ease(seg(p, i * 0.07, i * 0.07 + 0.18));
        const dec = ease(seg(p, 0.28 + i * 0.07, 0.46 + i * 0.07));
        const y = 232 - i * 36;
        return (
          <g key={i}>
            <rect
              x={112}
              y={y}
              width={180}
              height={28}
              rx={7}
              fill={SURF}
              stroke={EDGE}
              opacity={enc}
            />
            <rect
              x={428}
              y={y}
              width={180}
              height={28}
              rx={7}
              fill={SURF}
              stroke={i === 0 ? "var(--accent)" : EDGE}
              opacity={dec}
            />
            {/* cross-attention bridges the towers at every layer */}
            <path
              d={`M292 ${y + 14} L428 ${y + 14}`}
              stroke="var(--accent)"
              strokeWidth={1.2}
              strokeDasharray="4 5"
              opacity={ease(seg(p, 0.6 + i * 0.05, 0.78 + i * 0.05)) * 0.75}
            />
          </g>
        );
      })}

      <text
        x={202}
        y={272}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.12em"
        textAnchor="middle"
      >
        ENCODER ×6
      </text>
      <text
        x={518}
        y={272}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.12em"
        textAnchor="middle"
      >
        DECODER ×6 · MASKED
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 07 · Chart reveal — state of the art, at a fraction of the cost      */
/* ================================================================== */

function ChartReveal({ p }: { p: number }) {
  const bars = [
    { l: "GNMT", v: 24.6, hero: false },
    { l: "ConvS2S", v: 25.2, hero: false },
    { l: "Ensemble", v: 26.4, hero: false },
    { l: "Transformer", v: 28.4, hero: true },
  ];
  const max = 30;

  return (
    <Stage>
      <line x1={92} y1={228} x2={628} y2={228} stroke={EDGE} strokeWidth={1} />
      {bars.map((b, i) => {
        const a = ease(seg(p, i * 0.16, i * 0.16 + 0.28));
        const h = (b.v / max) * 160 * a;
        const x = 128 + i * 124;
        return (
          <g key={b.l}>
            <rect
              x={x}
              y={228 - h}
              width={72}
              height={h}
              rx={6}
              fill={b.hero ? "var(--accent)" : CHIP}
              stroke={b.hero ? "var(--accent)" : EDGE}
            />
            <text
              x={x + 36}
              y={252}
              fill={b.hero ? "var(--color-accent-lit)" : DIM}
              fontSize={10.5}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {b.l}
            </text>
            <text
              x={x + 36}
              y={220 - h}
              fill={b.hero ? CAP : INK}
              fontSize={13}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              opacity={a}
            >
              {b.v}
            </text>
          </g>
        );
      })}

      {/* training cost falling by an order of magnitude */}
      <path
        d="M128 84 C 260 92, 380 150, 616 196"
        stroke={INK}
        strokeWidth={1.5}
        strokeDasharray="5 5"
        fill="none"
        opacity={ease(seg(p, 0.55, 0.95)) * 0.7}
      />
      <text
        x={616}
        y={186}
        fill={DIM}
        fontSize={10.5}
        fontFamily="var(--font-mono)"
        textAnchor="end"
        opacity={ease(seg(p, 0.75, 1))}
      >
        TRAINING FLOPs ↓
      </text>
      <text
        x={92}
        y={62}
        fill={DIM}
        fontSize={11}
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
      >
        BLEU · WMT14 EN–DE
      </text>
    </Stage>
  );
}

/* ================================================================== */
/* 08 · Zoom out — the title was an understatement                      */
/* ================================================================== */

function ZoomOut({ p }: { p: number }) {
  const z = ease(p);
  const scale = 1 - z * 0.68;
  const kids = ["GPT", "BERT", "T5", "ViT", "LLaMA", "CLIP"];

  return (
    <Stage>
      <g
        transform={`translate(360 150) scale(${scale}) translate(-360 -150)`}
      >
        <rect
          x={276}
          y={104}
          width={168}
          height={92}
          rx={16}
          fill={SURF}
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
        <text
          x={360}
          y={156}
          fill={CAP}
          fontSize={16}
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          Transformer
        </text>
      </g>

      {kids.map((k, i) => {
        const angle = (i / kids.length) * Math.PI * 2 - Math.PI / 2;
        const r = 118;
        const x = 360 + cos(angle) * r;
        const y = 150 + sin(angle) * r * 0.82;
        const a = ease(seg(p, 0.35 + i * 0.08, 0.6 + i * 0.08));
        return (
          <g key={k} opacity={a}>
            <line
              x1={360}
              y1={150}
              x2={x}
              y2={y}
              stroke={EDGE}
              strokeWidth={1}
            />
            <rect
              x={x - 40}
              y={y - 17}
              width={80}
              height={34}
              rx={9}
              fill={SURF}
              stroke={EDGE}
            />
            <text
              x={x}
              y={y + 5}
              fill={INK}
              fontSize={12}
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {k}
            </text>
          </g>
        );
      })}
    </Stage>
  );
}

/* ================================================================== */
/* Fallback — the authored chips, for beats with no renderer yet        */
/* ================================================================== */

function Chips({ scene }: { scene: Scene }) {
  const items = useMemo(
    () =>
      scene.viz.map((t, i) => ({
        t,
        hot: i === scene.hot,
      })),
    [scene.viz, scene.hot],
  );

  return (
    <div className="flex min-w-0 max-w-[92%] flex-nowrap justify-center gap-1.5">
      {items.map((v, i) => (
        <div
          key={`${v.t}-${i}`}
          className="min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap rounded-[9px] px-3 py-[9px] text-center font-mono"
          style={{
            fontSize: "clamp(10px,1.5vh,15px)",
            background: v.hot ? "var(--accent)" : CHIP,
            border: `1px solid ${v.hot ? "var(--accent)" : FAINT}`,
            color: v.hot ? "#fff" : INK,
          }}
        >
          {v.t}
        </div>
      ))}
    </div>
  );
}
