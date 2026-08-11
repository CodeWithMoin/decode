"use client";

import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";

/**
 * One handle on the Player, shared by the surfaces that drive and read it.
 *
 * The Player is uncontrolled — it owns playback position, and `seekTo` plus the
 * `frameupdate` event are the only ways in and out. The timeline and transport
 * are siblings of the Player rather than children, so they need the ref by
 * context; the alternative is mirroring time into the store, which is the
 * pattern Remotion's docs explicitly warn against and what caused the update
 * loops.
 */
const PlayerRefContext = createContext<RefObject<PlayerRef | null> | null>(null);

export function PlayerRefProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PlayerRef | null>(null);
  return <PlayerRefContext.Provider value={ref}>{children}</PlayerRefContext.Provider>;
}

/**
 * Null outside the provider rather than throwing: the prototype's Export stage
 * and the connected screens render timeline-shaped things with no Player
 * mounted, and a hook that throws would make those a crash rather than a
 * surface with no preview.
 */
export function usePlayerRef(): RefObject<PlayerRef | null> | null {
  return useContext(PlayerRefContext);
}
