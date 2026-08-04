import type { Scene, TabId, Approvals } from "./types";

/**
 * Derived timing.
 *
 * Nothing here is ever stored. `dur` on a scene is the only timing input;
 * total runtime, scene start offsets, word timings, act splits and every
 * timecode in the app are recomputed from it. Reorder or retime anything and
 * the arc bar, timeline and captions all follow on their own —
 * the user never manually syncs.
 */

/** m:ss */
export function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Two-digit scene number, 1-indexed. */
export function num(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function total(scenes: Scene[]): number {
  return scenes.reduce((a, s) => a + s.dur, 0);
}

/** Start offset of each scene: starts[i] = Σ durations[0..i-1] */
export function starts(scenes: Scene[]): number[] {
  let acc = 0;
  return scenes.map((s) => {
    const v = acc;
    acc += s.dur;
    return v;
  });
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function scriptWordCount(scenes: Scene[]): number {
  return scenes.reduce((a, s) => a + wordCount(s.narration), 0);
}

/** Words per minute decides the pace label. */
export function pace(scene: Scene): "brisk" | "measured" {
  return wordCount(scene.narration) / (scene.dur / 60) > 165
    ? "brisk"
    : "measured";
}

/** Which scene is on screen at time t. */
export function sceneAt(scenes: Scene[], t: number): number {
  const st = starts(scenes);
  for (let i = st.length - 1; i >= 0; i--) if (t >= st[i]) return i;
  return 0;
}

export interface TimedWord {
  t: string;
  /** Absolute start time in the full runtime. */
  at: number;
  /** How long this word is on screen. */
  per: number;
}

/** A scene's duration spread evenly across its tokens. */
export function timedWords(scene: Scene, start: number): TimedWord[] {
  const toks = scene.narration.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const per = scene.dur / toks.length;
  return toks.map((t, i) => ({ t, at: start + i * per, per }));
}

/* ------------------------------------------------------------------
   Acts — three, split proportionally across the beat list
   ------------------------------------------------------------------ */

export interface Act {
  label: string;
  name: string;
  /** Indices into the scene array. */
  beats: number[];
  dur: number;
  meta: string;
  widthPct: string;
}

export function acts(scenes: Scene[]): Act[] {
  const n = scenes.length;
  const cut1 = Math.max(1, Math.round(n * 0.25));
  const cut2 = Math.max(cut1 + 1, Math.round(n * 0.75));
  const t = total(scenes) || 1;
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

  return (
    [
      { label: "ACT I", name: "The problem", beats: range(0, cut1) },
      { label: "ACT II", name: "The mechanism", beats: range(cut1, cut2) },
      { label: "ACT III", name: "The payoff", beats: range(cut2, n) },
    ] as const
  )
    .filter((a) => a.beats.length)
    .map((a) => {
      const dur = a.beats.reduce((acc, i) => acc + scenes[i].dur, 0);
      return {
        ...a,
        beats: [...a.beats],
        dur,
        meta: `${a.beats.length} beat${a.beats.length > 1 ? "s" : ""} · ${fmt(dur)}`,
        widthPct: `${((dur / t) * 100).toFixed(2)}%`,
      };
    });
}

/** Indices of Act II — used by the Producer's "tighten act II" action. */
export function actTwoRange(scenes: Scene[]): [number, number] {
  const n = scenes.length;
  const cut1 = Math.max(1, Math.round(n * 0.25));
  const cut2 = Math.max(cut1 + 1, Math.round(n * 0.75));
  return [cut1, cut2];
}

/* ------------------------------------------------------------------
   Stage gating
   ------------------------------------------------------------------ */

/** Nav level required to open each stage. */
export const NAV_LEVEL: Record<TabId, number> = {
  overview: 0,
  plan: 1,
  script: 2,
  edit: 5,
  export: 5,
};

/** A stage unlocks only when the previous one is approved. */
export function unlockLevel(a: Approvals): number {
  if (a.script) return 5;
  if (a.plan) return 2;
  if (a.understanding) return 1;
  return 0;
}

export function isLocked(tab: TabId, a: Approvals): boolean {
  return NAV_LEVEL[tab] > unlockLevel(a);
}

/* ------------------------------------------------------------------ *
 * Easing
 *
 * The interaction thesis allows exactly one curve, and CSS gets it from
 * `--ease-decode`. These are its scalar form, for progress driven in JS
 * (scroll scrub, scene playheads). Keep them here so the two can never
 * drift apart — three private copies is how a "single curve" quietly
 * becomes three.
 * ------------------------------------------------------------------ */

/** Clamp to the 0–1 progress domain. */
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Round to 6 decimals. Transcendental functions (`sin`, `cos`, `pow`) are not
 * bit-identical between Node's libm and the browser's, so a value derived from
 * one renders as e.g. `0.7895637203045311` on the server and
 * `0.7895637203045313` on the client — different strings, and React reports a
 * hydration mismatch. Quantising at the source makes every derived attribute
 * agree. Six decimals is far finer than any pixel or opacity step.
 */
export const q6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** `Math.sin`, made deterministic across server and client. */
export const sin = (x: number) => q6(Math.sin(x));

/** `Math.cos`, made deterministic across server and client. */
export const cos = (x: number) => q6(Math.cos(x));

/** Ease-out cubic — the scalar twin of `cubic-bezier(0.22, 1, 0.36, 1)`. */
export const ease = (t: number) => q6(1 - Math.pow(1 - clamp01(t), 3));

/** Progress inside a sub-window of a larger 0–1 range. */
export const seg = (p: number, from: number, to: number) =>
  clamp01((p - from) / Math.max(0.0001, to - from));
