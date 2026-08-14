"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fmt, num, paceOf, scriptWordCount, starts, total, wordCount } from "@/lib/derive";
import { changeProjectStage } from "@/lib/project-theme-transition";
import { useStudio } from "@/store/studio";
import { HandoffBar, HandoffBrief } from "@/components/crew/HandoffCard";
import { cx, Ghost, Graphite, StageKicker, Stepper } from "@/components/ui/primitives";

/**
 * Script — the Writer's stage.
 *
 * No right inspector: this is a full-width writing surface, not an
 * editor-plus-panel layout. Narration is editable in exactly one place in
 * the whole app — here, in place, via `contentEditable` — never a second
 * copy. Edit links back here instead of presenting another writing surface.
 *
 * `ScriptStage` below is the surface; `Script` is the prototype's wiring of it
 * to the store. The connected stage renders the same component against the
 * API, so there is one design and one implementation rather than a copy that
 * drifts. A capability the caller cannot provide — retiming, re-recording,
 * opening the canvas — is an absent handler, and the control hides itself.
 */

/** One passage, in the only shape this surface needs. */
export interface ScriptRow {
  id: string;
  narration: string;
  /** Seconds this passage was written against. */
  dur: number;
  /** What the Motion Designer built for it, when there is something. */
  anim?: string;
  /** Downstream work this passage's edits have outdated. */
  stale?: boolean;
  /** What the viewer should be able to do afterwards. */
  objective?: string;
}

export function ScriptStage({
  rows,
  startAt,
  selected,
  approved,
  message,
  why,
  notice,
  status,
  handoff,
  approveLabel,
  approveDisabled,
  onSelect,
  onEditNarration,
  onNudgeDuration,
  onReRecord,
  onOpenCanvas,
  onApprove,
  onPushBack,
  secondaryLabel,
}: {
  rows: ScriptRow[];
  startAt: number[];
  selected: number;
  approved: boolean;
  message: string;
  why: string;
  notice?: ReactNode;
  status?: string;
  handoff?: string;
  approveLabel?: string;
  approveDisabled?: boolean;
  onSelect: (index: number) => void;
  /** Absent where narration cannot be saved; the field becomes read-only. */
  onEditNarration?: (index: number, text: string) => void;
  onNudgeDuration?: (index: number, delta: number) => void;
  onReRecord?: (index: number) => void;
  onOpenCanvas?: (index: number) => void;
  onApprove: () => void;
  onPushBack: () => void;
  secondaryLabel?: string;
}) {
  const words = rows.reduce((sum, row) => sum + wordCount(row.narration), 0);
  const runtime = rows.reduce((sum, row) => sum + row.dur, 0);
  const wpm = runtime > 0 ? Math.round(words / (runtime / 60)) : 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col px-6 py-8 pb-[var(--handoff-h)] md:px-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <StageKicker>script</StageKicker>
          <h1 className="font-display text-[22px] font-semibold">Scene-by-scene narration</h1>
        </div>
        <div className="flex-none text-right font-mono text-[11px] tracking-[0.08em] text-t7 uppercase">
          <div>{words.toLocaleString()} words</div>
          <div>{wpm} wpm</div>
        </div>
      </div>

      <HandoffBrief crew="writer" message={message} why={why} />

      {notice}

      <div className="studio-shell mt-4 p-[3px]">
        <div className="studio-surface-muted flex flex-col rounded-[15px] p-2">
          {rows.map((row, i) => (
            <SceneBlock
              key={row.id}
              row={row}
              index={i}
              start={startAt[i] ?? 0}
              active={i === selected}
              onSelect={() => onSelect(i)}
              onEdit={onEditNarration && ((text) => onEditNarration(i, text))}
              onNudge={onNudgeDuration && ((delta) => onNudgeDuration(i, delta))}
              onOpenCanvas={onOpenCanvas && (() => onOpenCanvas(i))}
              onReRecord={onReRecord && (() => onReRecord(i))}
            />
          ))}
        </div>
      </div>

      <HandoffBar
        crew="writer"
        status={status ?? (approved ? "Approved" : "Awaiting approval")}
        approved={approved}
        handoff={handoff ?? "Handed to the Motion Designer — scene visuals next."}
        nextLabel="Next: Edit"
        approveLabel={approveLabel ?? "Approve and build scenes"}
        approveDisabled={approveDisabled}
        onApprove={onApprove}
        onPushBack={onPushBack}
        secondaryLabel={secondaryLabel}
        approvedSecondaryLabel={secondaryLabel}
      />
    </div>
  );
}

/** The prototype's wiring: the same surface, fed by the store. */
export function Script() {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const approvals = useStudio((s) => s.approvals);
  const staleByScene = useStudio((s) => s.staleByScene);
  const patch = useStudio((s) => s.patch);
  const nudgeDur = useStudio((s) => s.nudgeDur);
  const select = useStudio((s) => s.select);
  const approve = useStudio((s) => s.approve);
  const applyRegen = useStudio((s) => s.applyRegen);
  const setThreadOpen = useStudio((s) => s.setThreadOpen);

  const words = scriptWordCount(sc);
  const runtime = total(sc);

  return (
    <ScriptStage
      rows={sc.map((scene) => ({
        id: scene.id,
        narration: scene.narration,
        dur: scene.dur,
        anim: scene.anim,
        stale: (staleByScene[scene.id] ?? []).length > 0,
        objective: scene.objective,
      }))}
      startAt={starts(sc)}
      selected={sceneIdx}
      approved={approvals.script}
      message={`I wrote narration for all ${sc.length} scenes — ${words.toLocaleString()} words, timed to a ${fmt(runtime)} runtime.`}
      why="Pacing narration to the plan's timing up front means nothing needs re-syncing once you approve — voice and visuals line up on their own."
      onSelect={(i) => select(i)}
      onEditNarration={(i, narration) => patch(i, { narration })}
      onNudgeDuration={(i, delta) => nudgeDur(i, delta)}
      onReRecord={(i) => applyRegen(i, "voice")}
      onOpenCanvas={(i) =>
        changeProjectStage("script", "edit", () => select(i, { openCanvas: true }))
      }
      onApprove={() =>
        changeProjectStage("script", "edit", () =>
          approve(
            "script",
            "Approved the script. Handing off to the Motion Designer to build the scene visuals.",
            "Script approved",
            "edit",
          ),
        )
      }
      onPushBack={() => setThreadOpen(true)}
    />
  );
}

function SceneBlock({
  row,
  index,
  start,
  active,
  onSelect,
  onEdit,
  onNudge,
  onOpenCanvas,
  onReRecord,
}: {
  row: ScriptRow;
  index: number;
  start: number;
  active: boolean;
  onSelect: () => void;
  onEdit?: (text: string) => void;
  onNudge?: (delta: number) => void;
  onOpenCanvas?: () => void;
  onReRecord?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Set the editable's text once, and resync only on external changes (e.g.
  // a regeneration swapping narration/alt) — never while the element itself
  // has focus, or the caret fights a controlled value and typing reverses.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el) {
      el.textContent = row.narration;
    }
  }, [row.narration]);

  const count = wordCount(row.narration);
  const scenePace = paceOf(count, row.dur);
  const editable = Boolean(onEdit);

  return (
    <div
      onClick={onSelect}
      className={cx(
        "relative flex gap-0 rounded-[16px] border px-2 py-5 transition-[border-color] duration-[var(--t-fast)]",
        active ? "border-transparent" : "border-transparent bg-transparent hover:bg-white/60",
      )}
    >
      {active && (
        <motion.span
          layoutId="script-selection"
          className="pointer-events-none absolute inset-0 rounded-[16px] border border-[var(--accent-ring)] bg-card shadow-sm"
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
        />
      )}
      <div className="relative z-[1] w-[60px] flex-none pl-3">
        {active && (
          <motion.span
            layoutId="script-selection-rail"
            aria-hidden
            className="absolute top-0.5 left-0 h-[calc(100%-4px)] w-[2px] rounded-full"
            style={{ background: "var(--accent)" }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        <div className="font-display text-[13px] font-semibold text-ink-2">{num(index)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-t8">{fmt(start)}</div>
      </div>

      <div className="relative z-[1] min-w-0 flex-1">
        <div
          ref={ref}
          contentEditable={editable}
          suppressContentEditableWarning
          onBlur={(e) => onEdit?.(e.currentTarget.textContent ?? "")}
          className={cx(
            "rounded-lg px-2.5 py-1.5 text-[15px] leading-[1.75] text-ink-2 outline-none transition-colors",
            editable &&
              "hover:bg-sunken focus:bg-white focus:shadow-[inset_0_0_0_1.5px_var(--accent)]",
          )}
        />

        <div className="min-h-[34px]">
          <AnimatePresence initial={false} mode="wait">
            {active ? (
              <motion.div
                key="controls"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="mt-2 flex flex-wrap items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {onNudge ? (
                  <Stepper
                    value={fmt(row.dur)}
                    onMinus={() => onNudge(-5)}
                    onPlus={() => onNudge(5)}
                    label="Scene duration"
                  />
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full border border-line-input bg-card px-3 py-1.5 font-mono text-[12px] text-t6">
                    {fmt(row.dur)}
                  </span>
                )}
                {/* What the Motion Designer built, not a menu you pick from.
                    There is no fixed list of animation types — it writes the scene
                    from the visual spec, so offering eight named transitions would
                    describe a system that no longer exists. */}
                {(row.anim || row.stale) && (
                  <span className="flex items-center gap-1.5 rounded-full border border-line-input bg-card px-3 py-1.5 text-[12px] text-t6">
                    <span
                      aria-hidden
                      className={cx(
                        "h-1.5 w-1.5 rounded-full",
                        row.stale ? "bg-[var(--color-stale)]" : "bg-accent",
                      )}
                    />
                    {row.stale ? "Downstream update pending" : row.anim}
                  </span>
                )}
                {onReRecord && (
                  <>
                    <span className="flex items-center gap-1.5 rounded-full border border-line-input bg-card px-3 py-1.5 text-[12px] text-t6">
                      <span
                        aria-hidden
                        className={cx(
                          "h-1.5 w-1.5 rounded-full",
                          row.stale ? "bg-[var(--color-stale)]" : "bg-accent",
                        )}
                      />
                      {row.stale ? "Voice update pending" : "Nova"}
                    </span>
                    <Ghost type="button" onClick={onReRecord} className="px-3 py-1.5 text-[12px]">
                      Re-record
                    </Ghost>
                  </>
                )}
                {row.objective && !onOpenCanvas && (
                  <span className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-t7">
                    <span className="font-mono text-[8.5px] tracking-[0.1em] text-t8 uppercase">
                      Viewer outcome
                    </span>{" "}
                    {row.objective}
                  </span>
                )}
                {onOpenCanvas && (
                  <Graphite
                    onClick={onOpenCanvas}
                    className="ml-auto px-3.5 py-1.5 text-[12px] font-medium"
                  >
                    Open on canvas →
                  </Graphite>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="meta"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="mt-1.5 flex items-center gap-3 font-mono text-[10.5px] text-t7"
              >
                <span>{count} words</span>
                <span>{fmt(row.dur)}</span>
                <span className="capitalize">{scenePace}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
