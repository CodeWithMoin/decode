"use client";

import { useEffect, useRef } from "react";
import { SpecialistNote } from "@/components/crew/SpecialistNote";
import { Graphite, Stepper } from "@/components/ui/primitives";
import { fmt, num, pace, starts, wordCount } from "@/lib/derive";
import type { StaleKind } from "@/lib/types";
import { useStudio } from "@/store/studio";

/**
 * Inspector — the right panel of the Edit workspace, owned by the
 * Editor.
 *
 * This panel has one job: settings for the selected scene. Transcript
 * navigation was removed because the timeline already selects scenes and the
 * Script stage already owns narration. Repeating both jobs here made Edit feel
 * like three tools competing for the same space.
 *
 * Narration changes made in Script do not reset approval. They mark this
 * scene's visual spec, assets and voice stale — nothing outside it — and this
 * panel is where that downstream work can be rebuilt explicitly.
 */

const STALE_LABEL: Record<StaleKind, string> = {
  visual: "Visual spec",
  assets: "Assets",
  voice: "Voice",
};

export function Inspector() {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const regen = useStudio((s) => s.regen);
  const tone = useStudio((s) => s.tone);
  const staleByScene = useStudio((s) => s.staleByScene);
  const patch = useStudio((s) => s.patch);
  const nudgeDur = useStudio((s) => s.nudgeDur);
  const setTab = useStudio((s) => s.setTab);
  const setRegen = useStudio((s) => s.setRegen);
  const applyRegen = useStudio((s) => s.applyRegen);
  const say = useStudio((s) => s.say);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const st = starts(sc);
  const scene = sc[sceneIdx];

  const staleKinds: StaleKind[] = scene
    ? staleByScene[scene.id] ?? []
    : [];

  /**
   * Regeneration is never a bare spinner: the canvas overlay gets a specific
   * label, and the Producer thread gets a receipt that says what was *not*
   * touched.
   */
  function regenerate(kind: "scene" | "visuals" | "voice") {
    if (!scene || regen) return;
    const n = num(sceneIdx);
    const label =
      kind === "visuals"
        ? `Redrawing visuals for scene ${n}…`
        : kind === "voice"
          ? `Re-recording scene ${n} with Nova…`
          : `Redrafting scene ${n}…`;
    setRegen(label);

    timer.current = setTimeout(() => {
      applyRegen(sceneIdx, kind);
      say(
        kind === "visuals"
          ? `Redrew the visual for scene ${n}. Only this scene is touched — narration, voice and every other beat stay exactly as they were.`
          : kind === "voice"
            ? `Re-recorded scene ${n} with Nova. Only this scene is touched — the words and the visuals are unchanged.`
            : `Rebuilt scene ${n} end to end. Only this scene is touched. Everything else stays.`,
        `Scene ${n} · ${kind === "visuals" ? "visual rebuilt" : kind === "voice" ? "voice rebuilt" : "scene rebuilt"}`,
      );
    }, 900);
  }

  return (
    <aside
      className="panel-glass-alt hidden w-[318px] min-w-[240px] flex-none flex-col border-l border-line-head lg:flex"
      aria-label="Scene settings"
    >
      {scene ? (
        <>
          <div className="flex-none border-b border-line-inner px-4 py-3.5">
            <div className="font-mono text-[9.5px] tracking-[0.12em] text-t8 uppercase">
              Scene settings · {fmt(st[sceneIdx])}
            </div>
            <h2 className="mt-1 truncate font-display text-[15px] font-semibold text-ink">
              {num(sceneIdx)} · {scene.title}
            </h2>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <button
              type="button"
              onClick={() => setTab("script")}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-input bg-card px-3 py-2.5 text-left transition-colors hover:border-line-strong"
            >
              <span className="text-[12.5px] font-medium text-ink-2">Narration</span>
              <span className="font-mono text-[9.5px] text-t7">
                {wordCount(scene.narration)} words · Edit in Script →
              </span>
            </button>

            <SpecialistNote pos={sceneIdx} />

            {staleKinds.length > 0 && (
              <div
                className="rounded-xl border p-3"
                style={{
                  background: "var(--color-stale-bg)",
                  borderColor: "var(--color-stale-line)",
                }}
              >
                <div className="flex flex-wrap gap-1.5">
                  {staleKinds.map((k) => (
                    <span
                      key={k}
                      className="rounded-full border px-2 py-[3px] font-mono text-[10px] tracking-[0.06em] uppercase"
                      style={{
                        borderColor: "var(--color-stale-line)",
                        color: "var(--color-stale)",
                      }}
                    >
                      {STALE_LABEL[k]} · stale
                    </span>
                  ))}
                </div>
                <p
                  className="mt-2 text-[11.5px] leading-[1.6]"
                  style={{ color: "var(--color-stale-fg)" }}
                >
                  This scene has edits that its visuals and audio no longer match. Nothing
                  outside scene {num(sceneIdx)} is affected, and nothing has
                  been rebuilt yet.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Voice">
                <div className="flex min-h-10 items-center gap-2 rounded-xl border border-line-input bg-card px-3 py-2">
                  <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-accent" />
                  <span className="truncate text-[12.5px] text-ink-2">Nova · {tone}</span>
                </div>
              </Field>

              <Field label="Duration">
                <Stepper
                  value={fmt(scene.dur)}
                  onMinus={() => nudgeDur(sceneIdx, -5)}
                  onPlus={() => nudgeDur(sceneIdx, 5)}
                  size="lg"
                  label="Scene duration"
                />
              </Field>
            </div>

            {/* Read-only on purpose. The Motion Designer writes each scene
                from its visual spec; there is no closed set of transitions to
                choose between. To change it, change the spec below or press
                Regenerate — which is the control that actually does the work. */}
            <Field label="Visual treatment">
              <div className="w-full rounded-xl border border-line-input bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
                {scene.anim}
              </div>
            </Field>

            <p className="-mt-2 text-[11px] text-t7">
              Pacing: {pace(scene)} · narration auto-retimed
            </p>

            <Field label="Visual prompt">
              <textarea
                aria-label={`Visual prompt for scene ${num(sceneIdx)}`}
                value={scene.prompt}
                onChange={(e) => patch(sceneIdx, { prompt: e.target.value })}
                rows={4}
                className="w-full resize-y rounded-xl border border-line-input bg-card px-3 py-2.5 text-[13px] leading-[1.7] text-ink-2 focus:shadow-[inset_0_0_0_1.5px_var(--accent)]"
              />
            </Field>

            <div className="flex flex-col gap-2 border-t border-line-inner pt-3">
              <Graphite
                onClick={() => regenerate("scene")}
                disabled={regen !== null}
                className="w-full px-4 py-2.5 text-[13px] font-medium disabled:opacity-60"
              >
                ↻ Regenerate scene
              </Graphite>
              <div className="flex gap-2">
                <SmallButton
                  onClick={() => regenerate("visuals")}
                  disabled={regen !== null}
                >
                  Visuals only
                </SmallButton>
                <SmallButton
                  onClick={() => regenerate("voice")}
                  disabled={regen !== null}
                >
                  Voice only
                </SmallButton>
              </div>
              <p className="text-[11.5px] leading-[1.6] text-t6">
                Only this scene is touched. Everything else stays.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}

/* ------------------------------------------------------------------ */

function Field({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.1em] text-t7 uppercase">
          {label}
        </span>
        {meta && (
          <span className="flex-none font-mono text-[10px] text-t8">{meta}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function SmallButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-full border border-line-soft bg-card px-3 py-1.5 text-[12px] font-medium text-t5 transition-colors hover:border-[#B9B9B4] hover:text-ink disabled:opacity-60"
    >
      {children}
    </button>
  );
}
