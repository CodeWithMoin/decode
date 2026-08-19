/**
 * TSGB — Temporal Scene Graph Bridge: the data a choreographed scene IS.
 *
 * A scene is a cast of measured, bounded elements plus a script of verbs
 * anchored to narration word indices. No frame math exists in this shape:
 * the runtime (useChoreography) resolves words → seconds → frames, so
 * retiming narration retimes the film with nothing to update here.
 *
 * There is deliberately no `disappear` verb: elements leave only by
 * `transform` (becoming something else), so a scene assembles monotonically
 * and an empty frame is unrepresentable (docs/CHOREOGRAPHY-API.md).
 */

export interface WordTimestamp {
  word: string;
  startInSeconds: number;
  endInSeconds: number;
}

export type ChoreographyVerbType = "appear" | "indicate" | "dim" | "connect" | "transform";

export interface ChoreographyVerb {
  id: string;
  type: ChoreographyVerbType;
  targetId: string;
  /** The far end of a `connect`, or what a `transform` target becomes. */
  secondaryTargetId?: string;
  /** The narration word this verb lands on. */
  atWordIndex: number;
  /** How many words the verb's motion spans; defaults to a runtime-owned beat. */
  durationInWords?: number;
  params?: Record<string, unknown>;
}

export interface ElementConnection {
  targetId: string;
  /** 0..1 draw-on progress of the connector leaving this element. */
  progress: number;
}

export interface ElementChoreographyState {
  opacity: number;
  scale: number;
  isHighlighted: boolean;
  isDimmed: boolean;
  connections: ElementConnection[];
}

export type ChoreographyState = Record<string, ElementChoreographyState>;
