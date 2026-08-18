"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  ArrowsInLineHorizontal,
  Copy,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Trash,
} from "@phosphor-icons/react";
import { fmt, num, timecode } from "@/lib/derive";
import { cx } from "@/components/ui/primitives";
import { usePlayerRef } from "@/components/player/player-ref";
import { useCurrentPlayerFrame } from "@/components/player/use-current-player-frame";
import { DECODE_FPS, getDecodeTimeline } from "@/components/player/decode-timeline";
import { AudioWaveform } from "@/components/project/timeline/AudioWaveform";
import { useStudio } from "@/store/studio";

/**
 * Timeline — the bottom bar of the Edit workspace.
 *
 * A single gapless track: each scene is a clip laid out in order, with its
 * fades editable in place. Runtime, clip geometry, playhead offset and
 * timecodes are all derived from scene durations. There is no sync step.
 *
 * "Script writes, Timeline navigates" — this component never edits narration.
 * It seeks and it selects.
 */

/** Major ruler intervals, selected by rendered pixel density. */
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300] as const;

/** Track gutter. Shared by the ruler, the rows and the scrub maths. */
const GUTTER = 160;

/** Pixels per second at 1x zoom; 0.25x retains the compact whole-cut overview. */
const PPS = 12;

/** Breathing room after the cut, like the empty timeline in an NLE. */
const MIN_POST_ROLL_SECONDS = 30;

const minorStepFor = (major: number) => {
  if (major >= 300) return 60;
  if (major >= 120) return 30;
  if (major >= 60) return 10;
  if (major >= 30) return 5;
  if (major >= 15) return 5;
  if (major >= 10) return 2;
  if (major >= 5) return 1;
  if (major >= 2) return 0.5;
  return 0.2;
};

const rulerLabel = (seconds: number, duration: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (duration >= 3600) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export function Timeline() {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  // Where the creator last seeked to. Not the live playback position — the
  // Player owns that, and `PlayheadTime` subscribes to it directly.
  const playhead = useStudio((s) => s.playhead);
  const setPlaying = useStudio((s) => s.setPlaying);
  const seek = useStudio((s) => s.seek);
  const select = useStudio((s) => s.select);
  const splitScene = useStudio((s) => s.splitScene);
  const mergeScene = useStudio((s) => s.mergeScene);
  const reorder = useStudio((s) => s.reorder);
  const setClipFade = useStudio((s) => s.setClipFade);
  const checkpoint = useStudio((s) => s._pushHistory);
  const dupScene = useStudio((s) => s.dupScene);
  const removeScene = useStudio((s) => s.removeScene);
  const addScene = useStudio((s) => s.addScene);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const canUndo = useStudio((s) => s._history.length > 0);
  const canRedo = useStudio((s) => s._future.length > 0);
  const playing = useStudio((s) => s.playing);
  const playbackRate = useStudio((s) => s.playbackRate);
  const [deleteArmedScene, setDeleteArmedScene] = useState<number | null>(null);
  const deleteArmed = deleteArmedScene === sceneIdx;
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const zoomProgress = (zoom - 0.25) / 3.75;
  const trackRef = useRef<HTMLDivElement>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const fadeDetachRef = useRef<(() => void) | null>(null);

  const timeline = useMemo(() => getDecodeTimeline(sc), [sc]);
  const fullDur = timeline.durationInFrames / DECODE_FPS;
  const pixelsPerSecond = PPS * zoom;
  const postRoll = Math.max(MIN_POST_ROLL_SECONDS, fullDur * 0.2);
  const visibleDuration = Math.max(0, (viewportWidth - GUTTER) / pixelsPerSecond);
  const rulerDuration = Math.max(fullDur + postRoll, visibleDuration);

  const ruler = useMemo(() => {
    const majorStep = RULER_STEPS.find((step) => step * pixelsPerSecond >= 56) ?? RULER_STEPS[RULER_STEPS.length - 1];
    const minorStep = minorStepFor(majorStep);
    const max = Math.ceil(rulerDuration / majorStep) * majorStep;
    const major: { t: number; left: number }[] = [];
    const minor: { t: number; left: number; middle: boolean }[] = [];
    for (let t = 0; t <= max + 0.000001; t += minorStep) {
      const normalized = Number(t.toFixed(6));
      const majorIndex = normalized / majorStep;
      const isMajor = Math.abs(majorIndex - Math.round(majorIndex)) < 0.000001;
      if (isMajor) major.push({ t: normalized, left: normalized * pixelsPerSecond });
      else minor.push({ t: normalized, left: normalized * pixelsPerSecond, middle: Math.abs((normalized % majorStep) - majorStep / 2) < 0.000001 });
    }
    return { major, minor, end: max };
  }, [pixelsPerSecond, rulerDuration]);
  const timelineWidth = GUTTER + ruler.end * pixelsPerSecond;

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Map a viewport x to a time, measuring fresh so mid-drag scroll is honoured. */
  const seekAtX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clientX - r.left - GUTTER + (el.scrollLeft || 0);
      const t = Math.round((x / (PPS * zoom)) * DECODE_FPS) / DECODE_FPS;
      if (t < 0) return;
      const duration = getDecodeTimeline(useStudio.getState().sc).durationInFrames / DECODE_FPS;
      seek(Math.min(t, duration));
    },
    [seek, zoom],
  );

  const startScrub = useCallback(
    (clientX: number, touch: boolean) => {
      setPlaying(false);
      seekAtX(clientX);
      detachRef.current?.();

      const onMouseMove = (e: MouseEvent) => seekAtX(e.clientX);
      const onTouchMove = (e: TouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        e.preventDefault();
        seekAtX(t.clientX);
      };
      const end = () => detachRef.current?.();

      const detach = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", end);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", end);
        document.removeEventListener("touchcancel", end);
        detachRef.current = null;
      };
      detachRef.current = detach;

      if (touch) {
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", end);
        document.addEventListener("touchcancel", end);
      } else {
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", end);
      }
    },
    [seekAtX, setPlaying],
  );

  const startFadeDrag = useCallback((event: React.MouseEvent, sceneIndex: number, edge: "in" | "out") => {
    if (event.button !== 0) return;
    const scene = useStudio.getState().sc[sceneIndex];
    if (!scene || scene.locked) return;
    event.preventDefault();
    event.stopPropagation();
    select(sceneIndex, { preservePlayhead: true });
    setPlaying(false);
    const startX = event.clientX;
    const startValue = edge === "in" ? (scene.fadeIn ?? 0) : (scene.fadeOut ?? 0);
    let checkpointed = false;

    const onMove = (moveEvent: MouseEvent) => {
      if (!checkpointed && Math.abs(moveEvent.clientX - startX) >= 2) {
        checkpoint();
        checkpointed = true;
      }
      if (!checkpointed) return;
      const direction = edge === "in" ? 1 : -1;
      const delta = ((moveEvent.clientX - startX) / (PPS * zoom)) * direction;
      const frames = Math.round((startValue + delta) * DECODE_FPS);
      setClipFade(sceneIndex, edge, frames / DECODE_FPS);
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      fadeDetachRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    fadeDetachRef.current?.();
    fadeDetachRef.current = cleanup;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
  }, [checkpoint, select, setClipFade, setPlaying, zoom]);

  useEffect(() => () => detachRef.current?.(), []);
  useEffect(() => () => fadeDetachRef.current?.(), []);

  useEffect(() => {
    const onPlayerKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.code === "KeyZ" || event.code === "KeyY")) {
        event.preventDefault();
        const state = useStudio.getState();
        if (event.code === "KeyY" || event.shiftKey) { state.redo(); } else { state.undo(); }
        return;
      }
      if (event.code === "Equal" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setZoom((z) => Math.min(4, z + 0.25));
        return;
      }
      if (event.code === "Minus" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setZoom((z) => Math.max(0.25, z - 0.25));
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      const state = useStudio.getState();
      if (event.code === "Space") {
        if (event.repeat) return;
        event.preventDefault();
        const duration = getDecodeTimeline(state.sc).durationInFrames / DECODE_FPS;
        if (state.playing) {
          state.setPlaybackRate(0);
        } else {
          if (state.playhead >= duration) state.seek(0);
          state.setPlaybackRate(1);
        }
      } else if (event.code === "KeyJ") {
        if (event.repeat) return;
        event.preventDefault();
        const next = state.playbackRate < 0 ? Math.max(-4, state.playbackRate * 2) : -1;
        state.setPlaybackRate(next);
      } else if (event.code === "KeyK") {
        if (event.repeat) return;
        event.preventDefault();
        state.setPlaybackRate(0);
      } else if (event.code === "KeyL") {
        if (event.repeat) return;
        event.preventDefault();
        if (state.playhead >= getDecodeTimeline(state.sc).durationInFrames / DECODE_FPS) state.seek(0);
        const next = state.playbackRate > 0 ? Math.min(4, state.playbackRate * 2) : 1;
        state.setPlaybackRate(next);
      }
    };

    window.addEventListener("keydown", onPlayerKey);
    return () => window.removeEventListener("keydown", onPlayerKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 1 / DECODE_FPS;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = playhead - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = playhead + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = fullDur;
    if (next === null) return;
    e.preventDefault();
    setPlaying(false);
    seek(next);
  };

  const atStart = sceneIdx <= 0;
  const atEnd = sceneIdx >= sc.length - 1;

  const startClipDrag = (event: React.MouseEvent, sceneIndex: number) => {
    if (event.button !== 0) return;
    const scene = useStudio.getState().sc[sceneIndex];
    if (!scene) return;
    event.preventDefault();
    event.stopPropagation();
    setPlaying(false);
    select(sceneIndex, { preservePlayhead: true });
  };

  return (
    <div className="studio-surface flex min-h-0 w-full select-none flex-col overflow-hidden bg-[var(--nle-track)] text-[var(--nle-text)]">
      {/* Transport — the controls that act on time, above the axis they act on. */}
      <div className="rail-x flex h-11 flex-none items-center gap-1 overflow-x-auto border-b border-[var(--nle-grid-line)] bg-[var(--nle-panel)] px-2.5">
        <button type="button" onClick={() => splitScene(sceneIdx)} aria-label="Split selected scene" title="Split selected scene" className="nle-icon-button h-8 w-8 rounded-md">
          <Scissors size={16} weight="regular" aria-hidden />
        </button>
        <button type="button" onClick={() => mergeScene(sceneIdx)} aria-label="Merge selected scene with the next scene" title="Merge with next scene" className="nle-icon-button h-8 w-8 rounded-md">
          <ArrowsInLineHorizontal size={16} weight="regular" aria-hidden />
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--nle-grid-line)]" aria-hidden />
        <button
          type="button"
          onClick={() => reorder(sceneIdx, sceneIdx - 1)}
          disabled={atStart}
          aria-label="Move selected scene earlier"
          title="Move scene earlier"
          className="nle-icon-button h-8 w-8 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowUp size={15} weight="regular" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => reorder(sceneIdx, sceneIdx + 1)}
          disabled={atEnd}
          aria-label="Move selected scene later"
          title="Move scene later"
          className="nle-icon-button h-8 w-8 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowDown size={15} weight="regular" aria-hidden />
        </button>
        <button type="button" onClick={() => dupScene(sceneIdx)} aria-label="Duplicate selected scene" title="Duplicate scene" className="nle-icon-button h-8 w-8 rounded-md">
          <Copy size={15} weight="regular" aria-hidden />
        </button>
        <button type="button" onClick={() => addScene(sceneIdx)} aria-label="Add a scene after the selected scene" title="Add scene after" className="nle-icon-button h-8 w-8 rounded-md">
          <Plus size={15} weight="bold" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!deleteArmed) {
              setDeleteArmedScene(sceneIdx);
              return;
            }
            removeScene(sceneIdx);
            setDeleteArmedScene(null);
          }}
          disabled={sc.length <= 2}
          aria-label={deleteArmed ? "Confirm delete selected scene" : "Delete selected scene"}
          title={deleteArmed ? "Press again to delete" : "Delete scene"}
          className={cx(
            "nle-icon-button h-8 rounded-md px-2 disabled:opacity-30 disabled:hover:bg-transparent",
            deleteArmed && "border-[var(--accent)] bg-[var(--accent-tint)] text-accent-deep",
          )}
        >
          <Trash size={15} weight="regular" aria-hidden />
          {deleteArmed && <span className="ml-1 text-[10px] font-medium">Delete?</span>}
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--nle-grid-line)]" aria-hidden />
        <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo · ⌘Z" className="nle-icon-button h-8 w-8 rounded-md disabled:opacity-30 disabled:hover:bg-transparent">
          <ArrowCounterClockwise size={15} weight="regular" aria-hidden />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo · ⇧⌘Z" className="nle-icon-button h-8 w-8 rounded-md disabled:opacity-30 disabled:hover:bg-transparent">
          <ArrowClockwise size={15} weight="regular" aria-hidden />
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--nle-grid-line)]" aria-hidden />
        <button
          type="button"
          onClick={() => select(sceneIdx - 1)}
          disabled={atStart}
          aria-label="Previous scene"
          className="nle-icon-button h-8 w-8 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <SkipBack size={15} weight="regular" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!playing && playhead >= fullDur) seek(0);
            setPlaying(!playing);
          }}
          aria-label={playing ? "Pause — Space or K" : "Play — Space"}
          aria-keyshortcuts="Space K"
          className="nle-icon-button h-8 w-8 rounded-md bg-[var(--nle-panel-raised)] text-[var(--nle-text)]"
        >
          {playing ? <Pause size={15} weight="fill" aria-hidden /> : <Play size={15} weight="fill" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => select(sceneIdx + 1)}
          disabled={atEnd}
          aria-label="Next scene"
          className="nle-icon-button h-8 w-8 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <SkipForward size={15} weight="regular" aria-hidden />
        </button>

        {playing && (
          <span className="ml-1 rounded-[4px] bg-[var(--nle-panel-raised)] px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-accent-deep">
            {playbackRate < 0 ? `−${Math.abs(playbackRate)}×` : `${playbackRate}×`}
          </span>
        )}

        <div className="ml-auto mr-3 flex items-center gap-1" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Zoom timeline out"
            title="Zoom out"
            disabled={zoom <= 0.25}
            onClick={() => setZoom((current) => Math.max(0.25, Number((current - 0.25).toFixed(2))))}
            className="nle-icon-button h-7 w-7 rounded-[5px] disabled:opacity-30"
          >
            <Minus size={13} weight="bold" aria-hidden />
          </button>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Zoom level"
            aria-valuemin={25}
            aria-valuemax={400}
            aria-valuenow={Math.round(zoom * 100)}
            className="relative h-7 w-[88px] cursor-pointer outline-none focus-visible:outline-none"
            onMouseDown={(e: React.MouseEvent) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const update = (clientX: number) => {
                const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                setZoom(+(0.25 + frac * 3.75).toFixed(2));
              };
              update(e.clientX);
              const onMove = (ev: MouseEvent) => update(ev.clientX);
              const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") setZoom((current) => Math.max(0.25, Number((current - 0.25).toFixed(2))));
              else if (event.key === "ArrowRight" || event.key === "ArrowUp") setZoom((current) => Math.min(4, Number((current + 0.25).toFixed(2))));
              else if (event.key === "Home") setZoom(0.25);
              else if (event.key === "End") setZoom(4);
              else return;
              event.preventDefault();
            }}
          >
            <span className="absolute right-2 top-1/2 left-2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-line-strong" aria-hidden>
              <span className="block h-full origin-left rounded-full bg-t6" style={{ transform: `scaleX(${zoomProgress.toFixed(4)})` }} />
            </span>
            <span className="absolute left-0 top-1/2 h-3.5 w-3.5 rounded-full border border-line-strong bg-card shadow-sm" style={{ transform: `translate3d(${(zoomProgress * 74).toFixed(2)}px,-50%,0)` }} aria-hidden />
          </div>
          <button
            type="button"
            aria-label="Zoom timeline in"
            title="Zoom in"
            disabled={zoom >= 4}
            onClick={() => setZoom((current) => Math.min(4, Number((current + 0.25).toFixed(2))))}
            className="nle-icon-button h-7 w-7 rounded-[5px] disabled:opacity-30"
          >
            <Plus size={13} weight="bold" aria-hidden />
          </button>
        </div>

        <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--nle-faint)] uppercase">
          {sc.length} scenes
        </span>
      </div>

      {/* Scrub track — one time axis, one track hung off it. */}
      <div
        ref={trackRef}
        className="timeline-scroll relative flex min-h-0 flex-1 flex-col overflow-auto overscroll-x-none bg-[var(--nle-track)] outline-none"
      >
        <div className="relative" style={{ width: timelineWidth, minWidth: "100%" }}>
          {/* Ruler — sticky so it stays on screen while you scroll */}
          <div className="sticky top-0 z-10 flex h-8 flex-none border-b border-[var(--nle-line)] bg-[var(--nle-panel)]" style={{ minWidth: "100%" }}>
            <div className="flex flex-none items-center justify-center border-r border-[var(--nle-line)] bg-[var(--nle-panel-raised)] px-2" style={{ width: GUTTER }}>
              <span className="font-mono text-[17px] font-semibold tabular-nums tracking-[-0.035em] text-[var(--nle-text)]">
                <PlayheadTime fallback={playhead} />
              </span>
            </div>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Scrub the timeline"
              aria-valuemin={0}
              aria-valuemax={Math.round(fullDur)}
              aria-valuenow={Math.round(playhead)}
              aria-valuetext={`${fmt(playhead)} of ${fmt(fullDur)}`}
              onKeyDown={onKeyDown}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                startScrub(e.clientX, false);
              }}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (t) startScrub(t.clientX, true);
              }}
              className="relative h-8 flex-1 cursor-col-resize touch-none select-none outline-none focus:outline-none focus-visible:outline-none focus-visible:shadow-none"
            >
              {ruler.minor.map((tick) => (
                <div
                  key={`minor-${tick.t}`}
                  className="absolute bottom-0 w-px bg-line-mid"
                  style={{ left: tick.left, height: tick.middle ? 9 : 5 }}
                />
              ))}
              {ruler.major.map((tick) => (
                <div
                  key={tick.t}
                  className="absolute inset-y-0"
                  style={{ left: `${tick.left}px` }}
                >
                  <span className="absolute bottom-0 h-3 w-px bg-t8" />
                  <span
                    className="absolute top-1 font-mono text-[9.5px] tabular-nums tracking-[0.015em] text-t7"
                    style={{ transform: tick.t / ruler.end > 0.96 ? "translateX(-100%)" : tick.t === 0 ? undefined : "translateX(8px)" }}
                  >
                    {rulerLabel(tick.t, ruler.end)}
                  </span>
                </div>
              ))}
              <LivePlayhead fallback={playhead} pixelsPerSecond={PPS * zoom} flag />
            </div>
          </div>

          <div className="relative flex flex-col">
            <TimelineRow label="V1" name="Video" tone="video" height={52}>
              {timeline.clips.map(({ scene, sceneIndex, startFrame, durationInFrames }) => {
                const active = sceneIndex === sceneIdx;
                const locked = scene.locked;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onMouseDown={(event) => startClipDrag(event, sceneIndex)}
                    title={`${num(sceneIndex)} ${scene.title} · ${fmt(scene.dur)}`}
                    aria-label={`Scene ${num(sceneIndex)}, ${scene.title}`}
                    aria-current={active}
                    className={cx(
                      "group/clip absolute top-[4px] bottom-[4px] flex cursor-grab items-start overflow-hidden rounded-[5px] border text-left active:cursor-grabbing",
                      "border-[var(--nle-clip-line)] bg-[var(--nle-clip)] text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)] transition-[background-color,box-shadow] duration-[var(--t-fast)] hover:bg-[var(--nle-clip-hover)] focus-visible:outline-none",
                      active && "z-10 border-[var(--nle-clip-selected)] ring-1 ring-[var(--nle-clip-selected)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]",
                      scene.disabled && "opacity-40 saturate-0 line-through",
                      locked && "timeline-clip-locked cursor-not-allowed",
                    )}
                    style={{ left: (startFrame / DECODE_FPS) * PPS * zoom, width: Math.max(1, (durationInFrames / DECODE_FPS) * PPS * zoom - 1) }}
                  >
                    <ClipFadeHandle edge="in" seconds={scene.fadeIn ?? 0} duration={scene.dur} onMouseDown={(event) => startFadeDrag(event, sceneIndex, "in")} />
                    <ClipFadeHandle edge="out" seconds={scene.fadeOut ?? 0} duration={scene.dur} onMouseDown={(event) => startFadeDrag(event, sceneIndex, "out")} />
                    <span className="absolute inset-x-0 top-0 z-[1] flex h-[18px] items-center border-b border-white/10 bg-black/10 px-2">
                      <span className="mr-1.5 font-mono text-[8px] tabular-nums text-white/55">{num(sceneIndex)}</span>
                      <span className="truncate whitespace-nowrap text-[9.5px] font-semibold leading-none">{scene.title}</span>
                    </span>
                    <span className="absolute inset-x-0 top-[18px] bottom-0 opacity-40" aria-hidden>
                      <span className="absolute inset-y-1 left-1/4 w-px bg-white/25" />
                      <span className="absolute inset-y-1 left-1/2 w-px bg-white/25" />
                      <span className="absolute inset-y-1 left-3/4 w-px bg-white/25" />
                    </span>
                  </button>
                );
              })}
            </TimelineRow>
            <TimelineRow label="A1" name="Audio" tone="audio" height={46}>
              {timeline.clips.map(({ scene, sceneIndex, startFrame, durationInFrames }) => {
                const active = sceneIndex === sceneIdx;
                return (
                  <button
                    key={`audio-${scene.id}`}
                    type="button"
                    onMouseDown={(event) => startClipDrag(event, sceneIndex)}
                    title={`${num(sceneIndex)} audio · ${fmt(scene.dur)}`}
                    aria-label={`Audio for scene ${num(sceneIndex)}, ${scene.title}`}
                    className={cx(
                      "group/audio absolute top-[4px] bottom-[4px] flex items-center overflow-hidden rounded-[5px] border border-[var(--nle-audio-line)] bg-[var(--nle-audio-clip)] text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)] transition-[background-color,box-shadow] duration-[var(--t-fast)] hover:bg-[var(--nle-audio-clip-hover)]",
                      active && "z-10 ring-1 ring-[var(--nle-clip-selected)]",
                      !scene.audioUrl && "opacity-60",
                    )}
                    style={{ left: (startFrame / DECODE_FPS) * PPS * zoom, width: Math.max(1, (durationInFrames / DECODE_FPS) * PPS * zoom - 1) }}
                  >
                    {scene.audioUrl ? (
                      <>
                        <span className="absolute top-1 left-2 z-[1] max-w-[calc(100%_-_1rem)] truncate font-mono text-[7.5px] tracking-[0.06em] text-white/75 uppercase">
                          {num(sceneIndex)} · Narration
                        </span>
                        <AudioWaveform src={scene.audioUrl} />
                      </>
                    ) : (
                      <span className="px-2 font-mono text-[8px] tracking-[0.06em] text-white/65 uppercase">No narration</span>
                    )}
                  </button>
                );
              })}
            </TimelineRow>
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: GUTTER }}>
            <LivePlayhead fallback={playhead} pixelsPerSecond={PPS * zoom} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One track: a fixed gutter, then the time axis it shares with every other. */
function TimelineRow({
  label,
  name,
  tone,
  height,
  children,
}: {
  label: string;
  name?: string;
  tone?: "video" | "audio";
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex flex-none border-b border-[var(--nle-grid-line)] bg-[var(--nle-track)]"
      style={{ height }}
    >
      <div className="flex flex-none items-center gap-1 border-r border-[var(--nle-grid-line)] bg-[var(--nle-panel-raised)] px-1.5" style={{ width: GUTTER }}>
        {tone && (
          <span
            aria-hidden
            className={cx(
              "mr-1 h-2.5 w-[3px] rounded-full",
              tone === "video" ? "bg-[var(--nle-clip)]" : "bg-[var(--nle-audio-clip)]",
            )}
          />
        )}
        <span className="font-mono text-[9.5px] tracking-[0.08em] text-[var(--nle-faint)] uppercase">
          {label}
        </span>
        {name && <span className="ml-1 truncate text-[9px] text-[var(--nle-faint)]">{name}</span>}
      </div>
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ClipFadeHandle({
  edge,
  seconds,
  duration,
  onMouseDown,
}: {
  edge: "in" | "out";
  seconds: number;
  duration: number;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  const width = `${Math.max(0, Math.min(100, (seconds / Math.max(duration, 0.001)) * 100))}%`;
  const fadeIn = edge === "in";

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-[2]">
      {seconds > 0 && (
        <span className={`absolute inset-y-0 ${fadeIn ? "left-0" : "right-0"}`} style={{ width }}>
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon
              points={fadeIn ? "0,0 100,0 0,100" : "0,0 100,0 100,100"}
              fill="rgb(68 28 12 / 0.45)"
            />
            <line
              x1={fadeIn ? 0 : 100}
              y1="100"
              x2={fadeIn ? 100 : 0}
              y2="0"
              stroke="rgb(255 255 255 / 0.18)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </span>
      )}
      <span
        onMouseDown={onMouseDown}
        title={`${fadeIn ? "Fade in" : "Fade out"}: ${seconds.toFixed(2)}s`}
        className={`pointer-events-auto absolute top-0 h-[11px] w-[8px] cursor-ew-resize rounded-b-[3px] border border-white/10 bg-white/80 opacity-40 shadow-[0_1px_2px_rgb(0_0_0_/_0.4)] transition-[background-color,opacity] duration-[var(--t-fast)] group-hover/clip:opacity-70 hover:bg-white hover:opacity-100 ${fadeIn ? "-translate-x-1/2" : "translate-x-1/2"}`}
        style={fadeIn ? { left: width } : { right: width }}
      />
    </span>
  );
}

function LivePlayhead({ fallback, pixelsPerSecond, flag = false }: { fallback: number; pixelsPerSecond: number; flag?: boolean }) {
  const ref = usePlayerRef();
  const frame = useCurrentPlayerFrame(ref ?? { current: null });
  const seconds = ref ? frame / DECODE_FPS : fallback;
  const x = (seconds * pixelsPerSecond).toFixed(3);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0 will-change-transform"
      style={{ transform: `translate3d(${x}px,0,0)` }}
      aria-hidden
    >
      <div
        className={flag ? "absolute top-[15px] bottom-0 -left-px w-0.5" : "absolute inset-y-0 -left-px w-0.5"}
        style={{ background: "var(--accent)" }}
      />
      {flag && (
        <div
          className="absolute top-0 -left-[8px] h-[16px] w-[16px] border border-accent-deep"
          style={{ background: "var(--accent)", clipPath: "polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)" }}
        />
      )}
    </div>
  );
}

function PlayheadTime({ fallback }: { fallback: number }) {
  const ref = usePlayerRef();
  const frame = useCurrentPlayerFrame(ref ?? { current: null });
  return <>{timecode(ref ? frame / DECODE_FPS : fallback)}</>;
}
