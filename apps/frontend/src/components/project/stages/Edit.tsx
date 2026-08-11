"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inspector } from "@/components/project/Inspector";
import { Timeline } from "@/components/project/timeline/Timeline";
import { DecodePlayer } from "@/components/player/DecodePlayer";
import { PlayerRefProvider } from "@/components/player/player-ref";

/** How much of the workspace the frame gets, as a percentage. */
const MIN_SPLIT = 25;
const MAX_SPLIT = 80;

/**
 * Remembered across mounts, deliberately not in the store.
 *
 * Edit unmounts on every stage switch, so component state alone would snap the
 * panes back each time you came back — which is exactly the thing a person who
 * just resized them would notice. It is not project data either: it describes
 * this session's window, not the cut, so it must never reach an artifact.
 */
let lastSplit = 55;

/**
 * The Edit workspace — storyboard and timeline merged into one surface.
 *
 * Three components, each owning its own store reads, composed here and nowhere
 * else. This is the only stage with a right inspector, so the panel lives in
 * this file rather than in the shell: putting it in the shell would mean the
 * shell knowing which stage is which, and every other stage rendering an empty
 * 318px gutter.
 *
 * The workspace is height-constrained rather than page-scrolled. The timeline
 * has to stay pinned to the bottom of the viewport while the canvas takes the
 * remaining space — a scrolling page would push it off-screen and the scrub
 * would be unreachable exactly when you need it. `--header-h` keeps that sum
 * honest if the header's padding ever changes.
 */
export function Edit() {
  // Three columns, on purpose.
  //
  // The room used to stand in for Scene settings here, because as a floating
  // panel it landed on the same right edge and the canvas ended up the
  // narrowest of the three. Docked on the left it no longer competes: chat,
  // the frame, and the settings for the scene you are looking at, each in its
  // own column. Below lg the room is still an overlay and the question does
  // not arise.

  const shellRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(lastSplit);
  const detachRef = useRef<(() => void) | null>(null);

  const setClamped = useCallback((next: number) => {
    const value = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, next));
    lastSplit = value;
    setSplit(value);
  }, []);

  /**
   * Drag the divider.
   *
   * Bound on `document`, not the handle: a divider is two pixels wide and the
   * pointer leaves it on the first move of any real drag. `detach` is held in a
   * ref so unmounting mid-drag tears the listeners down and restores the
   * cursor with it.
   */
  const startDrag = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    detachRef.current?.();

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      setClamped(((e.clientY - r.top) / r.height) * 100);
    };
    const end = () => detachRef.current?.();
    const detach = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", end);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      detachRef.current = null;
    };
    detachRef.current = detach;

    // The cursor has to stay `row-resize` while the pointer is anywhere on the
    // page, not just over the two pixels it started on.
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", end);
  }, [setClamped]);

  useEffect(() => () => detachRef.current?.(), []);

  return (
    // The Player owns playback time; the timeline and transport read it through
    // this ref rather than through the store. Wrapping the whole stage means
    // they are siblings of the Player, which is where Remotion wants the
    // subscribing components to live.
    <PlayerRefProvider>
    <div ref={shellRef} className="flex min-h-0 flex-col bg-[var(--nle-bg)] lg:h-full lg:overflow-hidden">
      {/* Upper region — the frame, and beside it the settings for what is in
          the frame. Sized by the frame's own export ratio rather than stretched:
          Scene settings is scoped to the selected scene, so it ends where the
          picture ends and scrolls inside that height. */}
      <div
        className="flex min-h-0 flex-none flex-col lg:flex-row"
        style={{ height: `${split.toFixed(3)}%` }}
      >
        {/* The frame fits the height it is given and derives its own width from
            the export ratio, so Scene settings beside it can never stretch the
            row taller than the picture — it scrolls inside that height
            instead. */}
        <div className="nle-preview-wrap flex min-w-0 flex-none items-center justify-center bg-[var(--nle-bg)] p-4 lg:min-h-0 lg:flex-1">
          <div className="nle-preview-frame relative z-10 max-h-full max-w-full overflow-hidden border border-[var(--nle-line-strong)] bg-canvas shadow-[0_18px_44px_rgb(0_0_0_/_0.28)]">
            <DecodePlayer />
          </div>
        </div>

        <Inspector />
      </div>

      {/* Divider. A cutting room lets you trade picture height for track
          height, because which one you need depends on what you are doing —
          reviewing a frame or reading the shape of the cut. Keyboard-operable
          as well as draggable: it is a real control, not a decoration. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the frame and the timeline"
        aria-valuenow={Math.round(split)}
        aria-valuemin={MIN_SPLIT}
        aria-valuemax={MAX_SPLIT}
        tabIndex={0}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          startDrag();
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          if (e.key === "ArrowUp") setClamped(split - step);
          else if (e.key === "ArrowDown") setClamped(split + step);
          else return;
          e.preventDefault();
        }}
        className="group hidden h-2 flex-none cursor-row-resize items-center justify-center bg-[var(--nle-panel)] lg:flex"
      >
        <span
          aria-hidden
          className="h-px w-full bg-[var(--nle-grid-line)] transition-colors duration-[var(--t-fast)] group-hover:bg-[var(--nle-line-strong)] group-focus-visible:bg-[var(--accent)]"
        />
      </div>

      {/* The timeline is the whole cut, not this scene, so it takes the entire
          region below both — the axis every scene sits on, not a strip
          belonging to the preview. */}
      <div className="flex min-h-0 flex-none lg:flex-1">
        <Timeline />
      </div>
    </div>
    </PlayerRefProvider>
  );
}
