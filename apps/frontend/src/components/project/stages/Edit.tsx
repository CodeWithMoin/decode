"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inspector } from "@/components/project/Inspector";
import { Timeline } from "@/components/project/timeline/Timeline";
import { DecodePlayer } from "@/components/player/DecodePlayer";
import { PlayerRefProvider } from "@/components/player/player-ref";
import { fmt, num } from "@/lib/derive";
import { useStudio } from "@/store/studio";

/** How much of the workspace the frame gets, as a percentage. */
const MIN_SPLIT = 45;
const MAX_SPLIT = 80;

/**
 * Remembered across mounts, deliberately not in the store.
 *
 * Edit unmounts on every stage switch, so component state alone would snap the
 * panes back each time you came back — which is exactly the thing a person who
 * just resized them would notice. It is not project data either: it describes
 * this session's window, not the cut, so it must never reach an artifact.
 */
let lastSplit = 68;

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
export function Edit({
  onDirectScene,
  onEditNarration,
  candidateState = null,
  candidateApplying = false,
  candidateProgress,
  onApplyCandidate,
  showInspector = true,
  showTimeline = true,
}: {
  onDirectScene?: (beatId: string, direction: string) => void;
  onEditNarration?: () => void;
  candidateState?: "waiting" | "accepted" | null;
  candidateApplying?: boolean;
  candidateProgress?: { accepted: number; total: number };
  onApplyCandidate?: () => void;
  showInspector?: boolean;
  showTimeline?: boolean;
} = {}) {
  // Three columns in the full workstation, two in the chat-first connected
  // slice where scene settings are deliberately deferred.
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
  const sceneIdx = useStudio((state) => state.sceneIdx);
  const scene = useStudio((state) => state.sc[state.sceneIdx]);

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
    <div ref={shellRef} className="flex min-h-0 min-w-0 w-full max-w-full flex-col gap-2 overflow-x-hidden bg-sunken-2 p-2 sm:gap-3 sm:p-3 lg:h-full lg:overflow-hidden">
      {/* Upper region — the frame, and beside it the settings for what is in
          the frame. Sized by the frame's own export ratio rather than stretched:
          Scene settings is scoped to the selected scene, so it ends where the
          picture ends and scrolls inside that height. */}
      <div
        className={`studio-shell flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden lg:flex-row ${
          showTimeline ? "flex-none" : "flex-1"
        }`}
        style={showTimeline ? { height: `${split.toFixed(3)}%` } : undefined}
      >
        {/* The frame fits the height it is given and derives its own width from
            the export ratio, so Scene settings beside it can never stretch the
            row taller than the picture — it scrolls inside that height
            instead. */}
        <div className="studio-surface flex min-w-0 w-full max-w-full flex-none flex-col overflow-hidden lg:min-h-0 lg:flex-1">
          <div className="flex h-[52px] flex-none items-center gap-3 border-b border-line-div bg-card px-5">
            <span className="font-mono text-[8.5px] tabular-nums tracking-[0.13em] text-accent-deep uppercase">
              Scene {num(sceneIdx)}
            </span>
            <span className="min-w-0 truncate font-display text-[13px] font-semibold tracking-[-0.015em] text-ink">
              {scene?.title ?? "Untitled scene"}
            </span>
            {scene && (
              <span className="ml-auto flex-none font-mono text-[8.5px] tabular-nums tracking-[0.08em] text-t9 uppercase">
                {fmt(scene.dur)} · 24 fps
              </span>
            )}
            {candidateState === "waiting" && onApplyCandidate ? (
              <button
                type="button"
                onClick={onApplyCandidate}
                disabled={candidateApplying}
                className="flex h-7 flex-none items-center rounded-full border border-[var(--accent-line)] bg-[var(--accent)] px-3 text-[10px] font-medium text-white transition-[background-color,transform] duration-[var(--t-fast)] hover:bg-accent-top active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                {candidateApplying ? "Applying scene…" : "Apply scene"}
                {candidateProgress ? ` · ${candidateProgress.accepted}/${candidateProgress.total}` : ""}
              </button>
            ) : candidateState ? (
              <span className="flex flex-none items-center gap-1.5 font-mono text-[8.5px] tracking-[0.08em] text-accent-deep uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
                {candidateState === "accepted" ? "Applied" : "Review candidate"}
                {candidateProgress ? ` · ${candidateProgress.accepted}/${candidateProgress.total}` : ""}
              </span>
            ) : null}
          </div>
          <div className="edit-preview-field flex min-h-[240px] min-w-0 flex-1 flex-col px-4 pt-4 pb-3 sm:px-6 lg:min-h-0">
            <div className="nle-preview-wrap flex min-h-0 min-w-0 flex-1 items-center justify-center">
              <div className="nle-preview-frame relative z-10 max-h-full max-w-full overflow-hidden rounded-[12px] border border-[var(--nle-line-strong)] bg-canvas shadow-canvas">
                <DecodePlayer selfControlled={!showTimeline} />
              </div>
            </div>
            <div className="flex h-7 flex-none items-end justify-center gap-2 font-mono text-[8.5px] tracking-[0.06em] text-[var(--nle-faint)] uppercase">
              <span>1920 × 1080</span>
              <span aria-hidden>·</span>
              <span>16:9 preview</span>
            </div>
          </div>
        </div>

        {showInspector && (
          <Inspector
            onDirectScene={onDirectScene}
            onEditNarration={onEditNarration}
            candidateState={candidateState}
            candidateApplying={candidateApplying}
            candidateProgress={candidateProgress}
            onApplyCandidate={onApplyCandidate}
          />
        )}
      </div>

      {/* Divider. A cutting room lets you trade picture height for track
          height, because which one you need depends on what you are doing —
          reviewing a frame or reading the shape of the cut. Keyboard-operable
          as well as draggable: it is a real control, not a decoration. */}
      {showTimeline && (
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
        className="group hidden h-1 flex-none cursor-row-resize items-center justify-center bg-transparent lg:flex"
      >
        <span
          aria-hidden
          className="h-px w-12 rounded-full bg-line-strong transition-[background-color,width] duration-[var(--t-fast)] group-hover:w-20 group-hover:bg-t9 group-focus-visible:bg-[var(--accent)]"
        />
      </div>
      )}

      {/* The timeline is the whole cut, not this scene, so it takes the entire
          region below both — the axis every scene sits on, not a strip
          belonging to the preview. Deferred on the chat-first connected slice,
          which directs the cut in language rather than on a track. */}
      {showTimeline && (
        <div className="studio-shell flex min-h-0 flex-none overflow-hidden lg:flex-1">
          <Timeline />
        </div>
      )}
    </div>
    </PlayerRefProvider>
  );
}
