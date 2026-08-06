"use client";

import { useMemo } from "react";
import { SceneVisual } from "@/components/project/canvas/SceneVisual";
import { SEED_SCENES } from "@/lib/api";

/**
 * The hero diptych: what went in, and what came out of it.
 *
 * This replaced a four-phase autoplay reel. The reel showed source, then plan,
 * then scene — three unrelated frames, only one of which was on screen at a
 * time, so the reader never actually saw the relationship the product is *for*.
 * Showing both halves at once says the whole thing without a line of copy:
 * a page of your document on the left, the scene it became on the right.
 *
 * The connector is the argument. A chat interface can tell you what it did; it
 * structurally cannot show you which paragraph a scene came from. That link is
 * the one thing on this page a competitor built around a prompt box can't copy,
 * so it is drawn, labelled, and placed dead centre.
 *
 * The document body is greeked rather than set in real text. Two reasons: at
 * this scale real body copy is 7px noise that reads as texture anyway, and the
 * source is a real published paper we have no business reproducing. The shape
 * of a page is what carries the meaning; the words in it are not the point.
 */
export function SourceToScene() {
  const scenes = useMemo(() => SEED_SCENES(), []);
  const scene = scenes[3]; // Multi-Head Attention — the strongest renderer

  return (
    <div
      data-stage
      className="scene-surface relative w-full overflow-hidden rounded-[28px] shadow-[var(--shadow-dark-panel)]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 430px at 68% -8%, var(--accent-glow), transparent 68%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(closest-side, #000 28%, transparent 100%)",
        }}
      />

      {/* Subgrid, so the two kickers share one row and the two cards share the
          next. With plain `items-center` each figure centred independently:
          the labels landed 19px apart and the cards ended 37px apart at the
          bottom — near-alignment, which reads as a mistake rather than a
          choice. */}
      <div className="relative grid grid-cols-1 gap-6 px-5 py-6 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,0.86fr)_60px_minmax(0,1.14fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-0">
        <SourcePage />
        <Connector />
        <SceneOutput scene={scene} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- source -- */

function SourcePage() {
  return (
    <figure className="m-0 lg:row-span-2 lg:grid lg:grid-rows-subgrid">
      <Label>Your source</Label>
      <div className="flex flex-col rounded-[18px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
        <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[9px] bg-white text-[10px] font-bold text-ink">
            PDF
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-canvas-cap">
              attention-is-all-you-need.pdf
            </span>
            <span className="mt-0.5 block font-mono text-[9px] tracking-[0.1em] text-canvas-meta uppercase">
              11 pages · 5,214 words
            </span>
          </span>
        </div>

        {/* A page, greeked. The highlighted block is centred on purpose — it
            has to line up with the connector, which sits at the row's middle. */}
        <div className="pt-5">
          <Rules widths={[52, 96, 88]} />

          <div
            data-src-hit
            className="relative my-4 origin-left rounded-[8px] border border-[var(--accent-line)] bg-[var(--accent-wash)] py-3 pr-3 pl-4"
          >
            <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent-lit" />
            <div className="mb-2 font-mono text-[8.5px] tracking-[0.14em] text-accent-lit uppercase">
              § 3.2.2
            </div>
            <Rules widths={[94, 100, 71]} lit />
          </div>

          <Rules widths={[91, 84, 97, 63]} />
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/[0.07] pt-4 font-mono text-[9px] tracking-[0.1em] text-canvas-meta uppercase">
          <span>Page 4 of 11</span>
          <span>Multi-head attention</span>
        </div>
      </div>
    </figure>
  );
}

/** Greeked body lines. Decorative — the page never claims to be readable. */
function Rules({ widths, lit }: { widths: number[]; lit?: boolean }) {
  return (
    <div className="space-y-[7px]" aria-hidden>
      {widths.map((w, i) => (
        <span
          key={i}
          className="block h-[5px] rounded-full"
          style={{
            width: `${w}%`,
            background: lit ? "rgba(242,164,123,0.34)" : "rgba(255,255,255,0.085)",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- connector -- */

/**
 * Horizontal on desktop, vertical on mobile — the stacked layout reads top to
 * bottom, so an arrow still pointing right would point at nothing.
 */
function Connector() {
  return (
    <div
      className="flex items-center justify-center lg:row-span-2 lg:h-full"
      aria-hidden
    >
      <svg
        viewBox="0 0 60 40"
        className="h-8 w-14 rotate-90 overflow-visible lg:h-10 lg:w-[60px] lg:rotate-0"
        fill="none"
      >
        <path
          data-link
          d="M2 20 C 18 20, 20 9, 34 9 S 46 20, 56 20"
          stroke="var(--color-accent-lit)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M50 15 L 57 20 L 50 25"
          stroke="var(--color-accent-lit)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- output -- */

function SceneOutput({ scene }: { scene: ReturnType<typeof SEED_SCENES>[number] }) {
  return (
    <figure className="m-0 min-w-0 lg:row-span-2 lg:grid lg:grid-rows-subgrid">
      <Label>What Decode made from it</Label>
      <div className="flex flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.035]">
        {/* Stacked on small screens: side by side, the provenance chip starved
            the title into "Multi-Head A…" — and the title is the payoff. */}
        <div className="flex flex-col items-start gap-1 px-4 pt-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 sm:px-5">
          <span className="min-w-0 truncate font-display text-[15px] font-medium text-canvas-cap">
            {scene.title}
          </span>
          <span className="flex-none font-mono text-[9px] tracking-[0.12em] text-accent-lit uppercase">
            Scene 04 · from page 4
          </span>
        </div>

        <div className="grid flex-1 place-items-center px-2 pb-1">
          <div className="w-full">
            <SceneVisual scene={scene} p={0.82} />
          </div>
        </div>

        <figcaption className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 sm:px-5">
          <span className="min-w-0 truncate text-[12px] text-canvas-meta">
            {scene.caption}
          </span>
          <span className="flex-none font-mono text-[9px] tracking-[0.1em] text-canvas-meta uppercase">
            0:48
          </span>
        </figcaption>
      </div>
    </figure>
  );
}

/* ----------------------------------------------------------------- shared -- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 font-mono text-[9px] tracking-[0.15em] text-canvas-meta uppercase">
      {children}
    </div>
  );
}
