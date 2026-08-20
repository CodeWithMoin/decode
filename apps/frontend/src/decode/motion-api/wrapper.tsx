"use client";

import type { CSSProperties, ReactNode } from "react";
import { createContext, useContext } from "react";
import { q } from "@decode/animation-api";
import { useChoreography } from "./choreography";
import type {
  ChoreographyState,
  ChoreographyVerb,
  ElementChoreographyState,
  WordTimestamp,
} from "./tsgb";

/**
 * <Choreography> — the Layer-2 wrapper that binds a relational cast to a verb
 * script. It runs the word clock once and publishes the per-element visual
 * state through context; cast elements read it back with <Subject id>,
 * useSubjectState or useConnection. The cast is ordinary Layer-1 JSX
 * (Stack/Row/Anchor/Connector/Label/Card) — no coordinate or frame math.
 */

const IDLE: ElementChoreographyState = {
  opacity: 1,
  scale: 1,
  isHighlighted: false,
  isDimmed: false,
  connections: [],
};

interface ChoreographyContextValue {
  state: ChoreographyState;
  accent: string;
}

const ChoreographyContext = createContext<ChoreographyContextValue | null>(null);

export function Choreography({
  script,
  words,
  accent = "var(--decode-accent, #4b8ea1)",
  children,
}: {
  script: ChoreographyVerb[];
  /** Optional until the voice stage lands; the runtime degrades to t=0. */
  words?: WordTimestamp[];
  accent?: string;
  children?: ReactNode;
}) {
  const state = useChoreography(script, words);
  return (
    <ChoreographyContext.Provider value={{ state, accent }}>
      {children}
    </ChoreographyContext.Provider>
  );
}

/** The verb-driven visual state of one cast element, or an idle fallback. */
export function useSubjectState(id: string): ElementChoreographyState {
  const context = useContext(ChoreographyContext);
  return context?.state[id] ?? IDLE;
}

/** 0..1 draw-on progress of the connector leaving `fromId` toward `toId`. */
export function useConnection(fromId: string, toId: string): number {
  const state = useSubjectState(fromId);
  return state.connections.find((connection) => connection.targetId === toId)?.progress ?? 0;
}

/**
 * Wrap a cast element so the runtime can animate it by id. Applies the verb
 * state (opacity, scale) and a highlight ring while `indicate` is active.
 */
export function Subject({
  id,
  style,
  children,
}: {
  id: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const context = useContext(ChoreographyContext);
  const state = context?.state[id] ?? IDLE;
  // `indicate` draws attention with scale/opacity from the runtime — no coloured
  // highlight ring. The ring added a flash of accent at scene start and read as
  // chrome, not teaching.
  return (
    <div
      data-decode-box="subject"
      style={{
        opacity: q(state.opacity),
        transform: `scale(${q(state.scale)})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
