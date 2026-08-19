"use client";

/**
 * useChoreography — the TSGB temporal runtime.
 *
 * Verbs anchor to narration WORD INDICES; word timestamps resolve those to
 * seconds; Remotion's frame clock resolves seconds to now. The scene author
 * (a model) never sees a frame number, so hardcoded frame math — the source
 * of every desync and frozen-tail bug — cannot be written.
 *
 * Persistence is the runtime's law: an appeared element stays (dim recedes
 * it, never removes it), so no instant of the scene can be empty. All easing
 * lives here, written once.
 */

import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "@decode/animation-api";
import type {
  ChoreographyState,
  ChoreographyVerb,
  ElementChoreographyState,
  WordTimestamp,
} from "./tsgb";

/** One entrance/beat length when a verb spans no explicit words. */
const DEFAULT_BEAT_SECONDS = 0.6;
const DIMMED_OPACITY = 0.35;
const HIGHLIGHT_SCALE = 1.05;

const settle = (t: number) =>
  interpolate(t, [0, 1], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

function verbWindow(
  verb: ChoreographyVerb,
  words: WordTimestamp[],
): { start: number; end: number } {
  const anchor = words[Math.min(verb.atWordIndex, Math.max(words.length - 1, 0))];
  const start = anchor?.startInSeconds ?? 0;
  if (verb.durationInWords && verb.durationInWords > 0) {
    const last = words[Math.min(verb.atWordIndex + verb.durationInWords - 1, words.length - 1)];
    return { start, end: Math.max(last?.endInSeconds ?? start, start + DEFAULT_BEAT_SECONDS) };
  }
  return { start, end: start + DEFAULT_BEAT_SECONDS };
}

/** Pure evaluation — exported so tests and tools can judge any instant. */
export function choreographyStateAt(
  verbs: ChoreographyVerb[],
  words: WordTimestamp[],
  timeInSeconds: number,
): ChoreographyState {
  const state: ChoreographyState = {};
  // The cast is layout-agnostic: the ids come from the verbs themselves (a
  // target or a connect/transform far end), so this runtime drives relational
  // and explicit-layout scenes alike.
  const ids = new Set<string>();
  for (const verb of verbs) {
    ids.add(verb.targetId);
    if (verb.secondaryTargetId) ids.add(verb.secondaryTargetId);
  }
  const hasAppear = new Set(
    verbs.filter((verb) => verb.type === "appear").map((verb) => verb.targetId),
  );
  for (const id of ids) {
    state[id] = {
      // An element nobody introduces is scenery: visible from the start.
      opacity: hasAppear.has(id) ? 0 : 1,
      scale: 1,
      isHighlighted: false,
      isDimmed: false,
      connections: [],
    };
  }

  for (const verb of verbs) {
    const target = state[verb.targetId];
    if (!target) continue;
    const { start, end } = verbWindow(verb, words);
    if (timeInSeconds < start) continue;
    const progress = settle(Math.min((timeInSeconds - start) / Math.max(end - start, 0.05), 1));

    switch (verb.type) {
      case "appear":
        target.opacity = Math.max(target.opacity, progress);
        target.scale = 0.96 + 0.04 * progress;
        target.isDimmed = false;
        break;
      case "indicate": {
        // A pulse that settles: attention, then rest. Active only in-window.
        const active = timeInSeconds <= end + DEFAULT_BEAT_SECONDS;
        if (active) {
          target.isHighlighted = true;
          target.isDimmed = false;
          target.scale = 1 + (HIGHLIGHT_SCALE - 1) * Math.sin(progress * Math.PI);
        }
        break;
      }
      case "dim":
        target.isDimmed = true;
        break;
      case "connect":
        if (verb.secondaryTargetId && state[verb.secondaryTargetId]) {
          const existing = target.connections.find(
            (connection) => connection.targetId === verb.secondaryTargetId,
          );
          if (existing) existing.progress = Math.max(existing.progress, progress);
          else target.connections.push({ targetId: verb.secondaryTargetId, progress });
        }
        break;
      case "transform":
        // The target BECOMES the secondary: identity carried, never erased.
        target.opacity = Math.min(target.opacity, 1 - progress);
        if (verb.secondaryTargetId && state[verb.secondaryTargetId]) {
          const next = state[verb.secondaryTargetId];
          next.opacity = Math.max(next.opacity, progress);
          next.scale = 0.96 + 0.04 * progress;
        }
        break;
    }
  }

  // Dim applies after everything so a later indicate visibly outranks it.
  for (const element of Object.values(state)) {
    if (element.isDimmed && !element.isHighlighted) {
      element.opacity = Math.min(element.opacity, DIMMED_OPACITY);
    }
  }
  return state;
}

/** Frame-clocked view of the pure evaluator. */
export function useChoreography(
  verbs: ChoreographyVerb[],
  wordTimestamps: WordTimestamp[],
): ChoreographyState {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return choreographyStateAt(verbs, wordTimestamps, frame / fps);
}

export type { ChoreographyState, ElementChoreographyState };
