"use client";

import { useEffect, useMemo, useRef } from "react";
import { Player, type CallbackListener, type PlayerRef } from "@remotion/player";
import { Spinner } from "@/components/ui/primitives";
import {
  DECODE_FPS,
  DECODE_HEIGHT,
  DECODE_WIDTH,
  DecodeComposition,
  getDecodeDurationInFrames,
} from "@/components/player/DecodeComposition";
import { usePlayerRef } from "@/components/player/player-ref";
import { useStudio } from "@/store/studio";

/** Decode-owned preview boundary. Remotion remains an internal implementation detail. */
export function DecodePlayer() {
  const scenes = useStudio((state) => state.sc);
  const visualPick = useStudio((state) => state.visualPick);
  const playhead = useStudio((state) => state.playhead);
  const playing = useStudio((state) => state.playing);
  const playbackRate = useStudio((state) => state.playbackRate);
  const regen = useStudio((state) => state.regen);
  const sharedRef = usePlayerRef();
  const ownRef = useRef<PlayerRef | null>(null);
  const playerRef = sharedRef ?? ownRef;
  const durationInFrames = useMemo(() => getDecodeDurationInFrames(scenes), [scenes]);
  const inputProps = useMemo(() => ({ scenes, visualPick }), [scenes, visualPick]);



  /**
   * The Player owns playback position. Nothing writes it back.
   *
   * Remotion's Player is uncontrolled by design — there is no `currentFrame`
   * prop, only `seekTo` in and the `frameupdate` event out. We used to mirror
   * its position into the store on every frame, which is the pattern the docs
   * warn against on two counts: it re-renders the whole app at frame rate, and
   * the write-back raced our own `seekTo` into a loop that exceeded React's
   * update depth. Whoever needs the live frame subscribes to it directly with
   * `useCurrentPlayerFrame`, in a leaf that can afford to repaint.
   *
   * What is left is one direction only: the store holds where the creator
   * seeked to, and this nudges the Player there.
   */
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    /**
     * Stop the shuttle at either end.
     *
     * This reads `frameupdate` but writes no time — it compares the frame to a
     * boundary and stops transport, which is an event causing an action rather
     * than the two-way mirroring that looped. `ended` covers the forward edge
     * only; running J back to the start fires nothing, so without this the
     * shuttle sits at frame 0 still claiming to play in reverse.
     */
    const onFrameUpdate: CallbackListener<"frameupdate"> = ({ detail }) => {
      const { playbackRate, setPlaybackRate } = useStudio.getState();
      if (playbackRate === 0) return;
      const atStart = detail.frame <= 0 && playbackRate < 0;
      const atEnd = detail.frame >= durationInFrames - 1 && playbackRate > 0;
      if (atStart || atEnd) setPlaybackRate(0);
    };
    const onEnded: CallbackListener<"ended"> = () => useStudio.getState().setPlaybackRate(0);

    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("ended", onEnded);
    };
  }, [playerRef, durationInFrames]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      player.play();
      return;
    }
    player.pause();
    // Composition and timeline share the same time — no conversion needed.
    useStudio.getState().seek(player.getCurrentFrame() / DECODE_FPS);
  }, [playerRef, playing]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    // Only while paused. Playing, the Player is the clock, and seeking it to a
    // stale store value would drag it backwards every render.
    if (playing) return;
    const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round(playhead * DECODE_FPS)));
    if (player.getCurrentFrame() !== frame) player.seekTo(frame);
  }, [playerRef, durationInFrames, playhead, playing, scenes]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0B0B0B]">
      <Player
        ref={playerRef}
        // Silences Remotion's console license notice — the terms have been
        // reviewed (see decisions.md / the ADR-007 renderer-port discussion).
        acknowledgeRemotionLicense
        component={DecodeComposition}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={DECODE_WIDTH}
        compositionHeight={DECODE_HEIGHT}
        fps={DECODE_FPS}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        playbackRate={playbackRate === 0 ? 1 : playbackRate}
        moveToBeginningWhenEnded={false}
        style={{ width: "100%", height: "100%" }}
      />

      {regen && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3.5 bg-black/80" role="status" aria-live="polite">
          <Spinner size={22} track="#303030" />
          <div className="px-6 text-center font-mono text-[13.5px] text-[var(--nle-text)]">{regen}</div>
        </div>
      )}
    </div>
  );
}
