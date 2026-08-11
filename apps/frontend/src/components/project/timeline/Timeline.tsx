"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowsInLineHorizontal,
  Copy,
  Eye,
  EyeSlash,
  LockSimple,
  LockSimpleOpen,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Trash,
} from "@phosphor-icons/react";
import { WAVE_BARS } from "@/lib/api";
import { fmt, num, startsAll, timecode, totalAll } from "@/lib/derive";
import { cx } from "@/components/ui/primitives";
import { usePlayerRef } from "@/components/player/player-ref";
import { useCurrentPlayerFrame } from "@/components/player/use-current-player-frame";
import { DECODE_FPS } from "@/components/player/DecodeComposition";
import { useStudio } from "@/store/studio";

/**
 * Timeline — the bottom bar of the Edit workspace.
 *
 * Every measurement on screen is derived at render from one input, `scene.dur`:
 * the runtime, the adaptive ruler, each lane block's width, the playhead offset and
 * both timecodes. Nothing is stored, so retiming or reordering a scene moves
 * both lanes, every tick and both timecodes together. There is no sync
 * step and there must never be one.
 *
 * "Script writes, Timeline navigates" — this component never edits narration.
 * It seeks and it selects.
 */

/** Major ruler intervals, selected by rendered pixel density. */
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300] as const;

/** Track gutter. Shared by the ruler, the rows and the scrub maths. */
const GUTTER = 160;

/** Pixels per second at 1x zoom. */
const PPS = 3;

const WAVEFORM_POINTS = (() => {
  const width = 1000;
  const center = 16;
  const amplitude = 12;
  const top = WAVE_BARS.map((height, index) => {
    const x = (index / Math.max(1, WAVE_BARS.length - 1)) * width;
    const y = center - (height / 40) * amplitude;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const bottom = WAVE_BARS.map((height, index) => {
    const reverseIndex = WAVE_BARS.length - 1 - index;
    const x = (reverseIndex / Math.max(1, WAVE_BARS.length - 1)) * width;
    const y = center + (WAVE_BARS[reverseIndex] / 40) * amplitude;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return [...top, ...bottom].join(" ");
})();

/**
 * Waveform bar heights are stringified through `toFixed` before they
 * reach the DOM. `WAVE_BARS` is generated with `Math.sin`, which is not
 * bit-identical between Node's libm and the browser's — without quantising,
 * the server and client render styles that differ in the last decimal and
 * React reports a hydration mismatch.
 */
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
  const toggleScene = useStudio((s) => s.toggleScene);
  const dupScene = useStudio((s) => s.dupScene);
  const removeScene = useStudio((s) => s.removeScene);
  const addScene = useStudio((s) => s.addScene);
  const toggleMute = useStudio((s) => s.toggleMute);
  const toggleLock = useStudio((s) => s.toggleLock);
  const playing = useStudio((s) => s.playing);
  const playbackRate = useStudio((s) => s.playbackRate);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [draggingScene, setDraggingScene] = useState<number | null>(null);
  const [dragOverScene, setDragOverScene] = useState<number | null>(null);
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const getRowHeight = useCallback((id: string) => rowHeights[id] ?? 48, [rowHeights]);
  const [zoom, setZoom] = useState(1);
  const zoomProgress = (zoom - 0.25) / 3.75;

  // Two runtime measures: the cut (what exports) and the canvas (what you see).
  // Visual layout never changes when a scene is toggled off — disabled beats
  // keep their slot so the timeline never drifts.
  const fullDur = totalAll(sc) || 1;
  const zoomPx = fullDur * PPS * zoom;
  const st = startsAll(sc);

  const ruler = useMemo(() => {
    const pixelsPerSecond = PPS * zoom;
    const majorStep = RULER_STEPS.find((step) => step * pixelsPerSecond >= 56) ?? RULER_STEPS[RULER_STEPS.length - 1];
    const minorStep = minorStepFor(majorStep);
    const max = Math.ceil(fullDur / majorStep) * majorStep;
    const major: { t: number; left: number }[] = [];
    const minor: { t: number; left: number; middle: boolean }[] = [];
    for (let t = 0; t <= max + 0.000001; t += minorStep) {
      const normalized = Number(t.toFixed(6));
      const majorIndex = normalized / majorStep;
      const isMajor = Math.abs(majorIndex - Math.round(majorIndex)) < 0.000001;
      if (isMajor) major.push({ t: normalized, left: normalized * pixelsPerSecond });
      else minor.push({ t: normalized, left: normalized * pixelsPerSecond, middle: Math.abs((normalized % majorStep) - majorStep / 2) < 0.000001 });
    }
    return { major, minor };
  }, [fullDur, zoom]);

  /* ---------------------------------------------------------------- *
   * Drag-scrub
   *
   * The pointer leaves this element almost immediately in any real drag, so
   * move/end are bound on `document`, not here. `detach` is held in a ref so
   * unmount mid-drag tears the listeners down too.
   * ---------------------------------------------------------------- */

  const trackRef = useRef<HTMLDivElement>(null);
  const detachRef = useRef<(() => void) | null>(null);

  /** Map a viewport x to a time, measuring fresh so mid-drag scroll is honoured. */
  const seekAtX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clientX - r.left - GUTTER + (el.scrollLeft || 0);
      const t = Math.round((x / (PPS * zoom)) * DECODE_FPS) / DECODE_FPS;
      if (t < 0) return;
      seek(Math.min(t, totalAll(useStudio.getState().sc)));
    },
    [seek, zoom],
  );

  const startScrub = useCallback(
    (clientX: number, touch: boolean) => {
      // Any navigation stops playback.
      setPlaying(false);
      seekAtX(clientX);
      detachRef.current?.();

      const onMouseMove = (e: MouseEvent) => seekAtX(e.clientX);
      const onTouchMove = (e: TouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        // Non-passive, so this actually suppresses the page rubber-band.
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

  useEffect(() => () => detachRef.current?.(), []);
  useEffect(() => setDeleteArmed(false), [sceneIdx]);

  useEffect(() => {
    const onPlayerKey = (event: KeyboardEvent) => {
      // Undo/Redo and zoom shortcuts must fire before the modifier guard
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
        const duration = totalAll(state.sc);
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
        if (state.playhead >= totalAll(state.sc)) state.seek(0);
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

  return (
    <div className="flex min-h-0 w-full select-none flex-col overflow-hidden bg-[#141414] text-[var(--nle-text)]">
      {/* Transport — the controls that act on time, above the axis they act on.
          Only real actions appear here. An NLE puts loop, volume and zoom in
          this row; Decode has no loop model, no mixer and no zoom model, and a
          control that does nothing is worse than an absent one. */}
      <div className="flex h-11 flex-none items-center gap-1 border-b border-[var(--nle-grid-line)] bg-[var(--nle-panel)] px-2.5">
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
              setDeleteArmed(true);
              return;
            }
            removeScene(sceneIdx);
            setDeleteArmed(false);
          }}
          disabled={sc.length <= 2}
          aria-label={deleteArmed ? "Confirm delete selected scene" : "Delete selected scene"}
          title={deleteArmed ? "Press again to delete" : "Delete scene"}
          className={cx(
            "nle-icon-button h-8 rounded-md px-2 disabled:opacity-30 disabled:hover:bg-transparent",
            deleteArmed && "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent-lit)]",
          )}
        >
          <Trash size={15} weight="regular" aria-hidden />
          {deleteArmed && <span className="ml-1 text-[10px] font-medium">Delete?</span>}
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
            // Pressing play on a finished cut restarts it rather than doing
            // nothing. Moved here with the rest of the transport.
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
          <span className="ml-1 rounded-[4px] bg-[var(--nle-panel-raised)] px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-[var(--accent-lit)]">
            {playbackRate < 0 ? `−${Math.abs(playbackRate)}×` : `${playbackRate}×`}
          </span>
        )}


                {/* Zoom slider */}
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
            <span className="absolute right-2 top-1/2 left-2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-[#090909]" aria-hidden>
              <span className="block h-full origin-left rounded-full bg-[#626262]" style={{ transform: `scaleX(${zoomProgress.toFixed(4)})` }} />
            </span>
            <span className="absolute left-0 top-1/2 h-3.5 w-3.5 rounded-full border border-[#111111] bg-[#929292] shadow-[0_1px_2px_rgb(0_0_0_/_0.65)]" style={{ transform: `translate3d(${(zoomProgress * 74).toFixed(2)}px,-50%,0)` }} aria-hidden />
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

      {/* Scrub track — one time axis, two lanes hung off it. Animation labels
          and voice metadata live in Scene settings, where they can be acted on;
          repeating them here made the timeline taller but no more capable. */}
      <div
        ref={trackRef}
        className="timeline-scroll relative flex min-h-0 flex-1 flex-col overflow-auto bg-[#121212] outline-none"
      >
        <div className="relative" style={{ width: zoomPx, minWidth: "100%" }}>
        {/* Ruler — sticky so it stays on screen while you scroll tracks */}
        <div className="sticky top-0 z-10 flex h-8 flex-none border-b border-[#2B2B2B] bg-[#171717]" style={{ minWidth: "100%" }}>
          <div className="flex flex-none items-center justify-center border-r border-[#2B2B2B] bg-[#141414] px-2" style={{ width: GUTTER }}>
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
                className="absolute bottom-0 w-px bg-[#3C3C3C]"
                style={{ left: tick.left, height: tick.middle ? 9 : 5 }}
              />
            ))}
            {ruler.major.map((tick) => (
              <div
                key={tick.t}
                className="absolute inset-y-0"
                style={{
                  left: `${tick.left}px`,
                }}
              >
                <span className="absolute bottom-0 h-3 w-px bg-[#737373]" />
                <span
                  className="absolute top-1 font-mono text-[9.5px] tabular-nums tracking-[0.015em] text-[#A4A4A4]"
                  style={{ transform: tick.t / fullDur > 0.96 ? "translateX(-100%)" : tick.t === 0 ? undefined : "translateX(8px)" }}
                >
                  {rulerLabel(tick.t, fullDur)}
                </span>
              </div>
            ))}
            <LivePlayhead fallback={playhead} pixelsPerSecond={PPS * zoom} flag />
          </div>
        </div>

        {/* One row per scene, each at its own derived offset.
            A cutting-room timeline gives every clip its own track, and that is
            worth copying: the staircase shows the order and the relative
            lengths at once, and each row has somewhere to put per-scene detail
            later. What is *not* copied is free positioning — a row's offset and
            width are Σ dur and dur, so a scene cannot be dragged out of
            sequence or leave a hole. There is no sync step. */}
        <div className="rail-y relative flex flex-col">
          {sc.slice().reverse().map((s) => {
            const i = sc.indexOf(s);
            const active = i === sceneIdx;
            return (
              <TimelineRow
                key={s.id}
                label={num(i)}
                active={active}
                disabled={s.disabled}
                muted={s.muted}
                locked={s.locked}
                height={getRowHeight(s.id)}
                onResize={(px) => setRowHeights((prev) => ({ ...prev, [s.id]: px }))}
                onToggle={() => toggleScene(i)}
                onToggleMute={() => toggleMute(i)}
                onToggleLock={() => toggleLock(i)}
              >
                <button
                  type="button"
                  draggable={!s.locked}
                  onClick={() => { if (!s.locked) select(i); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(i));
                    setDraggingScene(i);
                    setDragOverScene(i);
                  }}
                  onDragEnter={() => setDragOverScene(i)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDragLeave={() => { if (dragOverScene === i) setDragOverScene(null); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingScene !== null && draggingScene !== i) reorder(draggingScene, i);
                    setDraggingScene(null);
                    setDragOverScene(null);
                  }}
                  onDragEnd={() => {
                    setDraggingScene(null);
                    setDragOverScene(null);
                  }}
                  title={`${num(i)} ${s.title} · ${fmt(s.dur)}`}
                  aria-label={`Scene ${num(i)}, ${s.title}`}
                  aria-current={active}
                  aria-grabbed={draggingScene === i}
                  className={cx(
                    "absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded-[5px] border px-2 text-left active:cursor-grabbing",
                    "transition-[background-color,border-color,filter,transform] duration-[var(--t-fast)]",
                    "border-[var(--accent-line)] bg-[var(--nle-clip)] text-[var(--nle-muted)] hover:bg-[var(--nle-clip-hover)] hover:text-[var(--nle-text)] focus-visible:border-[var(--accent)]",
                    dragOverScene === i && draggingScene !== i && "border-[var(--accent)] ring-1 ring-[var(--accent)]",
                    draggingScene === i && "opacity-60 cursor-grabbing",
                    s.disabled && "opacity-45 saturate-0 line-through",
                  )}
                  style={{ left: st[i] * PPS * zoom, width: s.dur * PPS * zoom }}
                >
                  <span className="truncate whitespace-nowrap text-[10.5px] font-medium">
                    {s.title}
                  </span>
                </button>
              </TimelineRow>
            );
          })}
          <TimelineRow label="Audio" height={36}>
            <div className="pointer-events-none absolute inset-x-0 top-1 bottom-1 overflow-hidden bg-[#111111]">
              <svg viewBox="0 0 1000 32" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
                <polygon points={WAVEFORM_POINTS} fill="#666666" opacity="0.82" />
                <line x1="0" x2="1000" y1="16" y2="16" stroke="#7A7A7A" strokeOpacity="0.32" strokeWidth="0.7" />
              </svg>
            </div>
          </TimelineRow>

          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: GUTTER }}>
            <LivePlayhead fallback={playhead} pixelsPerSecond={PPS * zoom} />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

/** One track: a fixed gutter, then the time axis it shares with every other. */
function TimelineRow({
  label,
  active = false,
  disabled = false,
  muted = false,
  locked = false,
  height,
  onToggle,
  onToggleMute,
  onToggleLock,
  onResize,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  muted?: boolean;
  locked?: boolean;
  height?: number;
  /** Absent on lanes that are not a beat, like the narration waveform. */
  onToggle?: () => void;
  onToggleMute?: () => void;
  onToggleLock?: () => void;
  /** Drag this row's bottom edge to resize it. Called with the new px height. */
  onResize?: (px: number) => void;
  children: React.ReactNode;
}) {
  const isBeat = !!onToggle;
  const resizeRef = useRef<HTMLDivElement>(null);
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      if (!onResize) return;
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = height ?? 48;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY;
        onResize(Math.max(24, Math.min(120, startH + delta)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onResize, height],
  );

  return (
    <div
      className={cx(
        "relative flex flex-none border-b border-[#242424] bg-[#151515]",
      )}
      style={{ height }}
    >
      <div className="flex flex-none items-center gap-1 border-r border-[#242424] bg-[#111111] px-1.5" style={{ width: GUTTER }}>
        <span
          className={cx(
            "font-mono text-[9.5px] tracking-[0.08em] uppercase",
            active ? "text-[var(--nle-text)]" : "text-[var(--nle-faint)]",
          )}
        >
          {label}
        </span>
        {isBeat && (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              onMouseDown={(e) => e.stopPropagation()}
              aria-pressed={muted}
              aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
              title={muted ? "No audio on this beat" : "Audio on — click to mute"}
              className={cx(
                "ml-auto grid h-5 w-5 flex-none place-items-center rounded-[4px] transition-colors duration-[var(--t-fast)]",
                muted
                  ? "text-[var(--nle-faint)]"
                  : "text-[var(--nle-muted)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)]",
              )}
            >
              {muted ? <SpeakerSimpleSlash size={14} weight="regular" aria-hidden /> : <SpeakerSimpleHigh size={14} weight="regular" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={onToggleLock}
              onMouseDown={(e) => e.stopPropagation()}
              aria-pressed={locked}
              aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
              title={locked ? "Locked — click to unlock" : "Lock — prevent edits"}
              className={cx(
                "grid h-5 w-5 flex-none place-items-center rounded-[4px] transition-colors duration-[var(--t-fast)]",
                locked
                  ? "text-[var(--accent-lit)]"
                  : "text-[var(--nle-faint)] hover:text-[var(--nle-text)]",
              )}
            >
              {locked ? <LockSimple size={14} weight="fill" aria-hidden /> : <LockSimpleOpen size={14} weight="regular" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={onToggle}
              onMouseDown={(e) => e.stopPropagation()}
              aria-pressed={!disabled}
              aria-label={disabled ? `Put ${label} back in the video` : `Take ${label} out of the video`}
              title={disabled ? "Not in the video — click to restore" : "In the video — click to disable"}
              className={cx(
                "grid h-5 w-5 flex-none place-items-center rounded-[4px] transition-colors duration-[var(--t-fast)]",
                disabled
                  ? "text-[var(--nle-faint)] hover:text-[var(--nle-text)]"
                  : "text-[var(--nle-muted)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)]",
              )}
            >
              {disabled ? <EyeSlash size={14} weight="regular" aria-hidden /> : <Eye size={14} weight="regular" aria-hidden />}
            </button>
          </>
        )}
      </div>
      <div className="relative min-w-0 flex-1">{children}</div>
      {onResize && (
        <div
          ref={resizeRef}
          onMouseDown={startResize}
          className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-[var(--accent-tint)] transition-colors"
          title="Drag to resize track"
        />
      )}
    </div>
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
          className="absolute top-0 -left-[8px] h-[16px] w-[16px] border border-[#0B0B0B]"
          style={{ background: "var(--accent)", clipPath: "polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)" }}
        />
      )}
    </div>
  );
}


/**
 * The running timecode, and the only thing here that repaints at frame rate.
 *
 * Remotion's docs are explicit that the component subscribing to the Player's
 * time must be a leaf adjacent to the Player rather than an ancestor of it,
 * or the whole app re-renders on every frame. This is that leaf: it paints
 * one fixed-width timecode and nothing else depends on it.
 *
 * Falls back to the store's seek position when no Player is mounted, which is
 * the case on any timeline-shaped surface outside the Edit stage.
 */
function PlayheadTime({ fallback }: { fallback: number }) {
  const ref = usePlayerRef();
  const frame = useCurrentPlayerFrame(ref ?? { current: null });
  return <>{timecode(ref ? frame / DECODE_FPS : fallback)}</>;
}
