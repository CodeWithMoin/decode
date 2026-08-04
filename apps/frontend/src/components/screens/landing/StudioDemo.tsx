"use client";

import { useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { SceneVisual } from "@/components/project/canvas/SceneVisual";
import { Kicker } from "@/components/ui/primitives";
import { CREW } from "@/lib/crew";
import { SEED_SCENES } from "@/lib/api";
import type { CrewId } from "@/lib/types";

type DemoState = "original" | "edited" | "updated";

const CREW_ORDER: CrewId[] = [
  "producer",
  "director",
  "writer",
  "motion",
  "editor",
];

const COPY: Record<DemoState, { eyebrow: string; title: string; receipt: string }> = {
  original: {
    eyebrow: "Scene 05 · approved",
    title: "Sine and cosine waves give every position its own signature.",
    receipt: "v1 · 38 seconds · everything up to date",
  },
  edited: {
    eyebrow: "You edited the narration",
    title:
      "Position one and position fifty end up with unmistakably different fingerprints.",
    receipt: "Draft saved · earlier steps untouched",
  },
  updated: {
    eyebrow: "Scene 05 · v2 ready",
    title:
      "Position one and position fifty end up with unmistakably different fingerprints.",
    receipt: "3 steps redone · total length unchanged",
  },
};

/**
 * The visual the scene is rebuilt into.
 *
 * `original` and `edited` share a frame on purpose: you have changed the words,
 * but nothing downstream has been redone yet, so the picture is deliberately
 * stale. Pressing "Update downstream work" is what swaps it — which is the only
 * reason the button means anything.
 *
 * Positional Encoding is used here because its two renderers are genuinely
 * different pictures (waves → fingerprints) and its alternate draft is the one
 * that talks about fingerprints. The words and the image change together
 * because they are the same edit, not because both were animated to.
 */
const PICK: Record<DemoState, "A" | "B"> = {
  original: "A",
  edited: "A",
  updated: "B",
};

/**
 * Decode's differentiator, shown rather than described. The visitor makes one
 * scene-level edit and can see the regeneration boundary stop at that scene.
 * Nothing auto-advances: the reader is the director.
 */
export function StudioDemo() {
  const scenes = useMemo(() => SEED_SCENES(), []);
  const scene = scenes[4]; // Positional Encoding — two real renderers, see PICK
  const [state, setState] = useState<DemoState>("original");
  const copy = COPY[state];

  const edit = () => setState("edited");
  const update = () => setState("updated");
  const reset = () => setState("original");

  return (
    <section
      id="decode-demo"
      data-scene="One scene changes"
      className="scroll-mt-24 pt-[clamp(88px,10vw,136px)]"
    >
      <div className="mb-[clamp(32px,4vw,52px)] grid grid-cols-1 items-end gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <Kicker className="mb-3 block">
            scope, made visible
          </Kicker>
          <h2
            data-reveal
            className="balance m-0 max-w-[720px] font-serif text-[clamp(34px,4.6vw,60px)] leading-[1.01] font-normal tracking-[-0.02em]"
          >
            Change one scene,
            <span className="text-t6"> and only that scene changes.</span>
          </h2>
        </div>
        <p
          data-reveal
          className="pretty m-0 max-w-[48ch] text-[14.5px] leading-[1.7] text-ink-2"
        >
          Edit the narration below. Decode shows exactly which steps need
          new work—and which ones remain untouched.
        </p>
      </div>

      <div
        data-reveal
        className="overflow-hidden rounded-[26px] border border-white/90 bg-card shadow-[var(--shadow-2xl)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line-div bg-sunken px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-ink font-display text-[11px] font-semibold text-white">
              D
            </span>
            <span className="truncate font-display text-[13.5px] font-semibold">
              Attention Is All You Need
            </span>
            <span className="hidden font-mono text-[9px] tracking-[0.12em] text-t6 uppercase sm:inline">
              Scene 05 of 08
            </span>
          </div>
          <span
            className="flex-none rounded-[8px] border px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] uppercase"
            style={{
              borderColor: state === "original" ? "var(--color-line-input)" : "var(--accent-line)",
              background: state === "original" ? "transparent" : "var(--accent-tint)",
              color: state === "original" ? "var(--color-t7)" : "var(--color-accent-deep)",
            }}
          >
            {state === "original" ? "The video now" : state === "edited" ? "Edit pending" : "Updated"}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.28fr)_minmax(340px,0.72fr)]">
          <div className="border-b border-line-div p-4 sm:p-6 lg:border-r lg:border-b-0">
            <div className="scene-surface overflow-hidden rounded-[20px] shadow-[var(--shadow-canvas)]">
              <div className="aspect-[16/8.7] min-h-[280px] p-3 sm:p-5">
                {/* `p` is held constant so the only thing that moves is the
                    thing the edit actually changed. Varying progress instead
                    made two frames of one animation look like a redesign. */}
                <SceneVisual scene={scene} p={0.8} pick={PICK[state]} />
              </div>
              <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
                <div className="mb-2 font-mono text-[9.5px] tracking-[0.13em] text-accent-lit uppercase">
                  {copy.eyebrow}
                </div>
                <p className="m-0 max-w-[66ch] text-[14px] leading-[1.65] text-canvas-cap">
                  {copy.title}
                </p>
                <div className="mt-3 font-mono text-[9.5px] tracking-[0.08em] text-canvas-meta uppercase">
                  {copy.receipt}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {state === "original" && (
                <button
                  type="button"
                  onClick={edit}
                  className="glass-graphite min-h-11 px-5 py-2.5 text-[13.5px] font-medium"
                >
                  Edit scene 05
                </button>
              )}
              {state === "edited" && (
                <button
                  type="button"
                  onClick={update}
                  className="glass-accent min-h-11 px-5 py-2.5 text-[13.5px] font-medium"
                >
                  Update downstream work
                </button>
              )}
              {state === "updated" && (
                <button
                  type="button"
                  onClick={reset}
                  className="flex min-h-11 items-center gap-2 rounded-[12px] border border-line-input bg-sunken px-4 py-2.5 text-[13px] font-medium transition-[background-color,scale] duration-[160ms] ease-decode hover:bg-card active:scale-[0.97]"
                >
                  <RotateCcw size={14} strokeWidth={1.7} aria-hidden />
                  Replay the edit
                </button>
              )}
              <span className="text-[12.5px] text-t6">
                {state === "original"
                  ? "Try the real regeneration boundary."
                  : state === "edited"
                    ? "The teaching plan and project structure remain approved."
                    : "Nothing outside scene 05 changed."}
              </span>
            </div>
          </div>

          <aside className="bg-sunken p-5 sm:p-6" aria-label="Who does what">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <div>
                <div className="font-display text-[15px] font-semibold">Inside Decode</div>
                <div className="mt-1 text-[12px] text-t5">Six specialists, each passing work to the next</div>
              </div>
              <span className="font-mono text-[9px] tracking-[0.12em] text-t6 uppercase">
                Scope receipt
              </span>
            </div>

            <ol className="m-0 list-none p-0">
              {CREW_ORDER.map((id, index) => {
                const member = CREW[id];
                const untouched = state !== "original" && index < 2;
                const editedByYou = state !== "original" && index === 2;
                const downstream = state !== "original" && index > 2;
                const finished = state === "updated" && downstream;
                const label =
                  state === "original"
                    ? "Current"
                    : untouched
                      ? "Untouched"
                      : editedByYou
                        ? "Edited by you"
                        : finished
                          ? "Updated"
                          : "Queued";

                return (
                  <li key={id} className="relative flex min-h-[58px] items-center gap-3">
                    {index < CREW_ORDER.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute left-[17px] top-[39px] h-[38px] w-px"
                        style={{ background: downstream ? "var(--accent-line)" : "var(--color-line-input)" }}
                      />
                    )}
                    <span
                      className="relative z-10 grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] font-display text-[11px] font-semibold text-white"
                      style={{ background: member.color, opacity: untouched ? 0.42 : 1 }}
                    >
                      {member.initial}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">{member.name}</span>
                      <span className="block truncate text-[11px] text-t5">{member.artifact}</span>
                    </span>
                    <span
                      className="flex min-w-[76px] items-center justify-end gap-1.5 font-mono text-[8.5px] tracking-[0.08em] uppercase"
                      style={{ color: finished || editedByYou ? "var(--color-accent-deep)" : "var(--color-t8)" }}
                    >
                      {finished && <Check size={11} strokeWidth={2} aria-hidden />}
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div
              className="mt-5 rounded-[12px] border px-4 py-3 text-[12px] leading-[1.6]"
              style={{
                borderColor: state === "original" ? "var(--color-line-input)" : "var(--accent-line)",
                background: state === "original" ? "var(--color-card)" : "var(--color-accent-card)",
                color: "var(--color-ink-2)",
              }}
            >
              {state === "original"
                ? "Every step keeps its source, history, and AI usage together."
                : state === "edited"
                  ? "Producer and Director stay untouched. Scene script changed; scene visuals and the timeline are queued."
                  : "Scene 05 was rebuilt. The other seven scenes were not touched at all."}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
