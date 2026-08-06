"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { WAVE_BARS } from "@/lib/api";
import { clamp01, fmt, num, total } from "@/lib/derive";
import { cx } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";

/**
 * Timeline — the bottom bar of the Edit workspace.
 *
 * Every measurement on screen is derived at render from one input, `scene.dur`:
 * the runtime, the 30s ruler, each lane block's width, the playhead offset and
 * both timecodes. Nothing is stored, so retiming or reordering a scene moves
 * both lanes, every tick and both timecodes together. There is no sync
 * step and there must never be one.
 *
 * "Script writes, Timeline navigates" — this component never edits narration.
 * It seeks and it selects.
 */

/** Ruler granularity, in seconds. */
const TICK_STEP = 30;

/**
 * Percentages and bar heights are stringified through `toFixed` before they
 * reach the DOM. `WAVE_BARS` is generated with `Math.sin`, which is not
 * bit-identical between Node's libm and the browser's — without quantising,
 * the server and client render styles that differ in the last decimal and
 * React reports a hydration mismatch.
 */
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

export function Timeline() {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const playhead = useStudio((s) => s.playhead);
  const playing = useStudio((s) => s.playing);
  const setPlaying = useStudio((s) => s.setPlaying);
  const seek = useStudio((s) => s.seek);
  const select = useStudio((s) => s.select);

  // `|| 1` only guards the degenerate empty-project divide; the store never
  // lets the scene list fall below two.
  const dur = total(sc) || 1;
  const frac = clamp01(playhead / dur);
  const cur = sc[sceneIdx] ?? sc[0];

  const ticks = useMemo(() => {
    const out: { t: number; left: string }[] = [];
    for (let t = 0; t <= dur; t += TICK_STEP) out.push({ t, left: pct(t / dur) });
    return out;
  }, [dur]);

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
      if (r.width <= 0) return;
      seek(clamp01((clientX - r.left) / r.width) * total(useStudio.getState().sc));
    },
    [seek],
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = playhead - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = playhead + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = dur;
    if (next === null) return;
    e.preventDefault();
    setPlaying(false);
    seek(next);
  };

  return (
    <div
      className="studio-surface-muted flex-none rounded-[18px] px-4 pt-3 pb-4 shadow-sm sm:px-5"
    >
      {/* Transport */}
      <div className="mb-2.5 flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-none bg-ink text-white transition-[background-color,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:bg-ink-2"
        >
          {playing ? (
            <Pause size={11} fill="currentColor" strokeWidth={0} aria-hidden />
          ) : (
            <Play
              size={11}
              fill="currentColor"
              strokeWidth={0}
              className="translate-x-px"
              aria-hidden
            />
          )}
        </button>

        <div className="font-mono text-xs text-t6">
          {fmt(playhead)} <span className="text-t11">/ {fmt(dur)}</span>
        </div>

        <div className="min-w-0 truncate border-l border-line-input pl-3.5 text-[11.5px] text-t6">
          Scene {num(sceneIdx)} · {cur?.title}
        </div>

        <div className="ml-auto hidden flex-none text-[11.5px] text-t6 xl:block">
          Drag to scrub · click a scene to select
        </div>
      </div>

      {/* Scrub track — one time axis, two useful lanes hung off it. Animation
          labels and voice metadata live in Scene settings, where they can be
          acted on; repeating them here made the timeline taller but no more
          capable. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Scrub the timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(playhead)}
        aria-valuetext={`${fmt(playhead)} of ${fmt(dur)}`}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => {
          // Let the scene buttons keep their own click.
          if (e.button !== 0) return;
          startScrub(e.clientX, false);
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) startScrub(t.clientX, true);
        }}
        className="relative cursor-col-resize touch-none select-none rounded-lg"
      >
        {/* Ruler — 30s ticks, placed against the derived runtime */}
        <div className="relative flex h-4">
          {ticks.map((tk) => (
            <div
              key={tk.t}
              className="absolute font-mono text-[9.5px] text-t10"
              style={{
                left: tk.left,
                // The final tick would otherwise hang off the right edge.
                transform: tk.t / dur > 0.96 ? "translateX(-100%)" : undefined,
              }}
            >
              {fmt(tk.t)}
            </div>
          ))}
        </div>

        <div className="relative flex flex-col gap-1.5">
          {/* Lane 1 — waveform */}
          <div className="flex h-10 items-center overflow-hidden rounded-lg border border-line bg-card px-0.5">
            {WAVE_BARS.map((h, i) => (
              <div
                key={i}
                className="mx-[0.5px] flex-1 rounded-[1px]"
                style={{
                  height: `${h.toFixed(2)}px`,
                  background:
                    i / WAVE_BARS.length <= frac
                      ? "var(--color-wave-on)"
                      : "var(--color-wave-off)",
                }}
              />
            ))}
          </div>

          {/* Lane 2 — scenes, proportional to dur */}
          <div className="flex h-8 gap-0.5">
            {sc.map((s, i) => {
              const active = i === sceneIdx;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(i)}
                  title={`${num(i)} ${s.title} · ${fmt(s.dur)}`}
                  aria-label={`Scene ${num(i)}, ${s.title}`}
                  aria-current={active}
                  className={cx(
                    "flex min-w-0 items-center overflow-hidden rounded-md border px-2 text-left",
                    "transition-colors duration-150",
                    active
                      ? "border-[var(--accent-ring)] bg-[var(--accent-tint)]"
                      : "border-line bg-sunken-2 hover:bg-sunken-3",
                  )}
                  style={{ flexGrow: s.dur, flexBasis: 0 }}
                >
                  <span className="truncate whitespace-nowrap text-[10.5px] font-medium">
                    {num(i)} {s.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Playhead — spans the ruler and both lanes */}
          <div
            className="pointer-events-none absolute bottom-0 -top-4"
            style={{ left: pct(frac), width: 0 }}
            aria-hidden
          >
            <div
              className="absolute -left-px top-0 bottom-0 w-0.5 rounded-[1px]"
              style={{ background: "var(--accent)" }}
            />
            <div
              className="absolute -top-0.5 -left-[5px] h-2.5 w-2.5 rounded-[3px]"
              style={{ background: "var(--accent)" }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
