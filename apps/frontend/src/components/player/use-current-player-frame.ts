"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { PlayerRef } from "@remotion/player";

/**
 * The Player's current frame, read the way Remotion prescribes.
 *
 * Source adapted from https://www.remotion.dev/docs/player/current-time — the
 * hook is not exported by `@remotion/player`, the docs hand you the
 * implementation to copy.
 *
 * The Player is uncontrolled. It owns its playback position, there is no
 * `currentFrame` prop, and the only way in is `seekTo`. We previously mirrored
 * that position into the Zustand store and wrote back on every `frameupdate`,
 * which is the pattern the docs warn against: it re-renders the whole app at
 * frame rate, and the write-back raced our own `seekTo` into a loop that blew
 * React's update depth.
 *
 * `useSyncExternalStore` confines the frame-rate churn to whichever leaf
 * actually paints a timecode or a playhead. Use it in a component *adjacent*
 * to the one rendering `<Player>`, never in the same one.
 */
export function useCurrentPlayerFrame(ref: React.RefObject<PlayerRef | null>): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const player = ref.current;
      if (!player) return () => undefined;
      player.addEventListener("frameupdate", onStoreChange);
      return () => {
        player.removeEventListener("frameupdate", onStoreChange);
      };
    },
    [ref],
  );

  return useSyncExternalStore<number>(
    subscribe,
    () => ref.current?.getCurrentFrame() ?? 0,
    () => 0,
  );
}
