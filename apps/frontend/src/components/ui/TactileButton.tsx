"use client";

import { forwardRef } from "react";
import { cx } from "./primitives";

/**
 * A CRED-style tactile button — deep dark, gradient-surfaced, physically
 * pressable, with an equalizer loading state.
 *
 * ── Scope note ────────────────────────────────────────────────────────
 * This is deliberately NOT part of Decode's approved design language. The
 * product is warm paper-light with hairline borders and near-flat elevation;
 * this component only makes sense on the dark canvas (#0E0E10) — e.g. the
 * transport controls in the Edit stage, where a pressable control is honest.
 * It is self-contained (own keyframes, own colour values, no shared tokens)
 * so it can be deleted in one file if we decide against it.
 * ──────────────────────────────────────────────────────────────────────
 */

type Size = "sm" | "md" | "lg";

export interface TactileButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  /** Swaps the label for the equalizer loader and blocks interaction. */
  isLoading?: boolean;
  size?: Size;
  /** Equalizer bar colours, left to right. Length sets the bar count. */
  bars?: string[];
  /** Announced to screen readers while loading. */
  loadingLabel?: string;
  /** Stretches to the container width. */
  block?: boolean;
}

const SIZES: Record<Size, string> = {
  sm: "h-9 rounded-[11px] px-4 text-[12.5px] tracking-[0.01em]",
  md: "h-11 rounded-[13px] px-5 text-[13.5px] tracking-[0.01em]",
  lg: "h-[52px] rounded-[15px] px-7 text-[15px] tracking-[0.005em]",
};

/** Bar geometry per size — width, gap, and the height they scale within. */
const BAR_METRICS: Record<Size, { w: number; gap: number; h: number }> = {
  sm: { w: 2.5, gap: 3, h: 13 },
  md: { w: 3, gap: 3.5, h: 16 },
  lg: { w: 3.5, gap: 4, h: 19 },
};

/**
 * Resting elevation. Read outside-in:
 *   1. ambient cast far below   — the "floating above the page" read
 *   2. contact shadow           — tight, keeps it from looking pasted on
 *   3. inset top highlight      — the 1px lip catching the simulated light
 *   4. inset bottom shade       — the underside of that same lip
 */
const REST = [
  "0 10px 26px -10px rgba(0,0,0,0.85)",
  "0 2px 4px -1px rgba(0,0,0,0.6)",
  "inset 0 1px 0 0 rgba(255,255,255,0.08)",
  "inset 0 -1px 0 0 rgba(0,0,0,0.55)",
].join(",");

/** Hover: lifted, so the cast spreads and the light lip brightens. */
const HOVER = [
  "0 16px 34px -12px rgba(0,0,0,0.9)",
  "0 3px 6px -2px rgba(0,0,0,0.6)",
  "inset 0 1px 0 0 rgba(255,255,255,0.13)",
  "inset 0 -1px 0 0 rgba(0,0,0,0.55)",
].join(",");

/**
 * Pressed: every shadow inverts. The cast collapses to nothing, the light
 * lip moves to the bottom (light now hits the far wall of the recess), and
 * the top gets the shade. That inversion — not the translate — is what
 * actually reads as "pushed into the screen".
 */
const PRESSED = [
  "inset 0 2px 6px 0 rgba(0,0,0,0.9)",
  "inset 0 1px 2px 0 rgba(0,0,0,0.8)",
  "inset 0 -1px 0 0 rgba(255,255,255,0.05)",
  "0 1px 0 0 rgba(255,255,255,0.03)",
].join(",");

const DEFAULT_BARS = ["#F2A47B", "#C2410C", "#E8E8E4", "#7A7A72"];

export const TactileButton = forwardRef<HTMLButtonElement, TactileButtonProps>(
  function TactileButton(
    {
      children,
      isLoading = false,
      size = "md",
      bars = DEFAULT_BARS,
      loadingLabel = "Working",
      block = false,
      className,
      disabled,
      style,
      ...rest
    },
    ref,
  ) {
    const locked = disabled || isLoading;

    return (
      <>
        <Keyframes />
        <button
          {...rest}
          ref={ref}
          disabled={locked}
          aria-busy={isLoading || undefined}
          data-tactile
          className={cx(
            "group relative isolate select-none font-sans font-medium text-[#E8E8E4]",
            // Named properties, never `all`: this element also changes box-shadow
            // imperatively on pointer events, and `all` would animate that
            // twice over.
            "transition-[translate,scale,box-shadow,color] duration-[160ms] ease-decode",
            "outline-none focus-visible:ring-2 focus-visible:ring-[#F2A47B]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]",
            // The lift is only 1px. Past that it stops reading as a button
            // and starts reading as a card being dragged.
            "hover:-translate-y-px active:scale-[0.98]",
            // `enabled:` guards keep the disabled surface inert.
            "disabled:cursor-not-allowed disabled:text-[#E8E8E4]/40",
            SIZES[size],
            block ? "w-full" : "w-auto",
            className,
          )}
          style={{
            // Gradient, not flat — the surface has to have a top and a bottom
            // for the inset highlight to be describing anything.
            backgroundImage:
              "linear-gradient(180deg, #181A1F 0%, #15171B 55%, #121417 100%)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: REST,
            ...style,
          }}
          onMouseEnter={(e) => {
            if (!locked) e.currentTarget.style.boxShadow = HOVER;
            rest.onMouseEnter?.(e);
          }}
          onMouseLeave={(e) => {
            if (!locked) e.currentTarget.style.boxShadow = REST;
            rest.onMouseLeave?.(e);
          }}
          onPointerDown={(e) => {
            if (!locked) e.currentTarget.style.boxShadow = PRESSED;
            rest.onPointerDown?.(e);
          }}
          onPointerUp={(e) => {
            if (!locked) e.currentTarget.style.boxShadow = HOVER;
            rest.onPointerUp?.(e);
          }}
        >
          {/* A single specular sweep across the top third. Without it the
              gradient reads as paint; with it, it reads as a material. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-[inherit] opacity-60 transition-opacity duration-200 group-active:opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.055), transparent)",
            }}
          />

          {/* Label and loader occupy the same grid cell, so swapping between
              them never changes the button's width. No layout shift, no
              neighbouring elements jumping when a request starts. */}
          <span className="relative grid place-items-center">
            <span
              className={cx(
                "[grid-area:1/1] transition-opacity duration-200",
                isLoading ? "opacity-0" : "opacity-100",
              )}
            >
              {children}
            </span>
            <span
              aria-hidden={!isLoading}
              className={cx(
                "[grid-area:1/1] flex items-end transition-opacity duration-200",
                isLoading ? "opacity-100" : "opacity-0",
              )}
              style={{ gap: BAR_METRICS[size].gap }}
            >
              {bars.map((colour, i) => (
                <span
                  key={i}
                  className="tb-bar block rounded-full"
                  style={{
                    width: BAR_METRICS[size].w,
                    height: BAR_METRICS[size].h,
                    background: colour,
                    // Stagger, plus alternating durations so the bars drift
                    // out of phase instead of locking into one visible cycle.
                    animationDelay: `${i * 110}ms`,
                    animationDuration: i % 2 === 0 ? "620ms" : "760ms",
                    // Paused when idle — an offscreen animation still burns
                    // frames otherwise.
                    animationPlayState: isLoading ? "running" : "paused",
                  }}
                />
              ))}
            </span>
          </span>

          {isLoading && <span className="sr-only">{loadingLabel}</span>}
        </button>
      </>
    );
  },
);

/**
 * React 19 hoists and de-dupes `<style>` by `href`, so this ships once no
 * matter how many buttons render. Keeps the keyframes with the component
 * instead of polluting the global token sheet.
 */
function Keyframes() {
  return (
    <style
      href="tactile-button"
      precedence="default"
      dangerouslySetInnerHTML={{
        __html: `
@keyframes tb-eq {
  0%, 100% { transform: scaleY(0.3); }
  50%      { transform: scaleY(1); }
}
.tb-bar {
  transform-origin: center;
  animation-name: tb-eq;
  animation-iteration-count: infinite;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  /* Still a live signal, just no bouncing: the bars hold a static
     staggered profile and breathe opacity instead of height. */
  .tb-bar {
    animation-name: tb-eq-quiet;
    animation-duration: 1.4s !important;
    transform: scaleY(0.7);
  }
  @keyframes tb-eq-quiet {
    0%, 100% { opacity: 0.35; }
    50%      { opacity: 1; }
  }
}`,
      }}
    />
  );
}
