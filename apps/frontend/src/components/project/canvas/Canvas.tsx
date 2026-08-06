"use client";

import { SceneVisual } from "@/components/project/canvas/SceneVisual";
import { Spinner } from "@/components/ui/primitives";
import { clamp01, fmt, num, starts, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";

/**
 * The Edit canvas — the scene as it will render.
 *
 * Two structural rules, both recorded as fixed bugs in the handoff spec:
 *
 * 1. The footer is a **flex sibling**, never absolutely positioned. Absolute
 *    positioning let a tall visual slide under the transport controls; as a
 *    sibling it always reserves its own row and the stage takes what is left.
 * 2. The chips are `flex:0 1 auto; min-width:0` on a `flex-nowrap` row, so a
 *    long set **shrinks and ellipses** rather than wrapping to a second line
 *    or clipping off the right edge.
 *
 * Everything time-shaped here is derived at render: the scene on screen, its
 * progress, the timecode and the runtime all come out of `dur`. Nothing is
 * stored, so retiming or reordering a scene updates this surface on its own.
 */
export function Canvas() {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const playhead = useStudio((s) => s.playhead);
  const regen = useStudio((s) => s.regen);
  const visualPick = useStudio((s) => s.visualPick);

  const runtime = total(sc);
  const i = Math.min(Math.max(sceneIdx, 0), sc.length - 1);
  const scene = sc[i];
  if (!scene) return null;

  const start = starts(sc)[i] ?? 0;
  /** Progress through *this* scene — the same 0…1 the visuals are drawn from. */
  const p = clamp01((playhead - start) / Math.max(1, scene.dur));

  return (
    <div
      className="scene-surface relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px]"
      style={{ boxShadow: "var(--shadow-canvas)" }}
    >
      {/* Stage — takes whatever the footer leaves, and never more. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 overflow-hidden px-[26px] pt-[22px] pb-2">
        <div className="flex-none text-center font-mono text-[10.5px] tracking-[0.16em] text-canvas-label">
          SCENE {num(i)} · {scene.title.toUpperCase()}
        </div>

        <div className="min-h-0 w-full flex-1">
          <SceneVisual scene={scene} p={p} pick={visualPick[i]} />
        </div>

        {/* Trap 2: nowrap row of shrinkable chips. */}
        <div className="flex min-w-0 max-w-[92%] flex-none flex-nowrap justify-center gap-1.5">
          {scene.viz.map((v, ix) => {
            const hot = ix === scene.hot;
            return (
              <div
                key={`${scene.id}-${v}-${ix}`}
                className="min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap rounded-[9px] px-3 py-[9px] text-center font-mono"
                style={{
                  fontSize: "clamp(10px,1.5vh,15px)",
                  background: hot ? "var(--accent)" : "var(--color-canvas-chip)",
                  border: `1px solid ${hot ? "var(--accent)" : "var(--color-canvas-line)"}`,
                  color: hot ? "#fff" : "var(--color-canvas-chip-fg)",
                }}
              >
                {v}
              </div>
            );
          })}
        </div>

        <div
          className="max-w-[74%] flex-none text-center font-display font-medium leading-[1.25] text-canvas-cap"
          style={{ fontSize: "clamp(15px,2.3vh,22px)" }}
        >
          {scene.caption}
        </div>
      </div>

      {/* A real footer row, not an absolute overlay. Transport lives once, in the timeline. */}
      <div className="flex flex-none items-center gap-3 px-5 pb-4">
        <div className="font-mono text-[11.5px] text-canvas-meta">
          {fmt(playhead)} / {fmt(runtime)}
        </div>

        <div className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-canvas-faint">
          1920 × 1080 · 24 fps
        </div>
      </div>

      {/* Never a bare spinner: the label says exactly what is being rebuilt. */}
      {regen && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3.5"
          style={{
            background: "rgba(14,14,16,0.82)",
          }}
          role="status"
          aria-live="polite"
        >
          <Spinner size={22} track="#3A3A42" />
          <div className="px-6 text-center font-mono text-[13.5px] text-canvas-chip-fg">
            {regen}
          </div>
        </div>
      )}
    </div>
  );
}
