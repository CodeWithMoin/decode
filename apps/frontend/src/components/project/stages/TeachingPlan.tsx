"use client";

import { Fragment, useMemo, type DragEvent, type KeyboardEvent } from "react";
import { HandoffBar, HandoffBrief } from "@/components/crew/HandoffCard";
import { StageKicker, Stepper, cx } from "@/components/ui/primitives";
import { acts, fmt, num, pace, starts, total } from "@/lib/derive";
import type { Scene } from "@/lib/types";
import { useStudio } from "@/store/studio";

/**
 * Teaching Plan — the Director's stage.
 *
 * The shape of the lesson before a word of narration exists: three acts, the
 * beats inside them, and how long each one is allowed to take.
 *
 * Every number on this screen is derived at render — `total = Σ dur`,
 * `starts[i] = Σ dur[0..i-1]`, act spans and segment widths all recomputed from
 * the scene list. Drag a beat or nudge a duration and the arc bar, the act
 * columns and every timecode follow on their own. There is no sync step.
 *
 * Reordering is a plan-level edit, so it resets `plan` *and* `script` approval
 * (the store's `reorder` owns that). Retiming a beat does not — it changes how
 * long an idea breathes, not what order the ideas arrive in.
 */
export function TeachingPlan() {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const approvals = useStudio((s) => s.approvals);
  const dragPos = useStudio((s) => s.dragPos);
  const dragOverPos = useStudio((s) => s.dragOverPos);
  const reorder = useStudio((s) => s.reorder);
  const setDragPos = useStudio((s) => s.setDragPos);
  const setDragOverPos = useStudio((s) => s.setDragOverPos);
  const nudgeDur = useStudio((s) => s.nudgeDur);
  const select = useStudio((s) => s.select);
  const approve = useStudio((s) => s.approve);
  const setThreadOpen = useStudio((s) => s.setThreadOpen);
  const ask = useStudio((s) => s.ask);
  const say = useStudio((s) => s.say);

  const structure = useMemo(() => acts(sc), [sc]);
  const runtime = useMemo(() => total(sc), [sc]);
  const offsets = useMemo(() => starts(sc), [sc]);

  const dragging = dragPos !== null;

  /**
   * `dragOverPos` is an insertion slot in the *original* array (0…n), so the
   * bar can sit above the first beat or below the last one. Splicing removes
   * the dragged beat first, which shifts every slot after it down by one.
   */
  const drop = (slot: number) => {
    if (dragPos === null) return;
    reorder(dragPos, slot > dragPos ? slot - 1 : slot);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sc.length) return;
    reorder(from, to);
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col px-6 pt-6 pb-[var(--handoff-h)] lg:px-8">
      {/* ============================ header ============================ */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <StageKicker>teaching plan</StageKicker>
          <h1 className="m-0 mt-1 font-display text-[clamp(22px,3vw,27px)] font-semibold tracking-[-0.01em]">
            {structure.length} act{structure.length === 1 ? "" : "s"},{" "}
            {sc.length} beat{sc.length === 1 ? "" : "s"} — one per scene
          </h1>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-[0.1em] text-t7 uppercase">
            Total runtime
          </div>
          <div className="font-mono text-[18px] tabular-nums">{fmt(runtime)}</div>
        </div>
      </div>

      <HandoffBrief
        crew="director"
        message={`I shaped the paper into ${sc.length} beats across ${structure.length} acts. Act I earns the problem, Act II carries the mechanism one step at a time, and Act III pays it off — I kept the derivation whole instead of splitting it across an act break.`}
        why="The mechanism only lands once the failure is felt, so the bottleneck opens the video and the results wait until the machinery is understood."
      />

      {/* =========================== runtime arc =========================== */}
      <section
        aria-label="Runtime arc"
        className="mb-6 rounded-2xl border border-line-input bg-card p-4"
      >
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="font-mono text-[10px] tracking-[0.1em] text-t7 uppercase">
            Runtime arc
          </div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-t7 uppercase tabular-nums">
            {fmt(runtime)} across {sc.length} beats
          </div>
        </div>

        {/* One segment per beat, width = its share of the runtime. */}
        <div className="flex gap-[3px]">
          {sc.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(i)}
              title={`${s.title} · ${fmt(s.dur)}`}
              aria-label={`Beat ${num(i)}, ${s.title}, ${fmt(s.dur)}`}
              aria-current={i === sceneIdx ? "true" : undefined}
              className="h-[10px] min-w-[6px] rounded-full border-none transition-colors duration-[var(--t-fast)]"
              style={{
                flex: `0 0 calc(${((s.dur / (runtime || 1)) * 100).toFixed(3)}% - 3px)`,
                background:
                  i === sceneIdx ? "var(--accent)" : "var(--color-line-soft)",
              }}
            />
          ))}
        </div>

        {/* Act columns, sized by the same proportion. */}
        <div className="mt-3 flex gap-3">
          {structure.map((a) => (
            <div
              key={a.label}
              className="min-w-0 border-t border-line-input pt-2"
              style={{ flex: `0 0 calc(${a.widthPct} - 12px)` }}
            >
              <div className="font-mono text-[9.5px] tracking-[0.12em] text-t8 uppercase">
                {a.label}
              </div>
              <div className="truncate text-[13px] font-medium">{a.name}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-t7 tabular-nums">
                {a.meta}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================== beats ============================== */}
      {structure.map((a) => (
        <section key={a.label} className="mb-7 last:mb-0">
          <div className="mb-3 flex items-center gap-3">
            <StageKicker className="flex-none">{a.name}</StageKicker>
            <div className="h-px flex-1 bg-line-input" aria-hidden />
            <div className="flex-none font-mono text-[10px] tracking-[0.1em] text-t7 uppercase tabular-nums">
              {a.label} · {a.meta}
            </div>
          </div>

          {/* The spine. */}
          <div className="relative flex flex-col gap-2.5">
            <div
              className="absolute top-2 bottom-2 left-[7px] w-[1.5px] bg-[#E3E3DF]"
              aria-hidden
            />

            {a.beats.map((i) => {
              const s = sc[i];
              return (
                <Fragment key={s.id}>
                  <InsertBar show={dragging && dragOverPos === i} />
                  <Beat
                    scene={s}
                    index={i}
                    start={offsets[i]}
                    active={i === sceneIdx}
                    ghost={dragPos === i}
                    last={i === sc.length - 1}
                    onSelect={() => select(i)}
                    onNudge={(d) => nudgeDur(i, d)}
                    onMove={(dir) => move(i, i + dir)}
                    onDragStart={() => setDragPos(i)}
                    onDragEnd={() => {
                      setDragPos(null);
                      setDragOverPos(null);
                    }}
                    onSlot={setDragOverPos}
                    onDrop={drop}
                  />
                </Fragment>
              );
            })}

            {/* Tail slot, so a beat can be dropped at the very end. */}
            {a.beats.includes(sc.length - 1) && (
              <InsertBar show={dragging && dragOverPos === sc.length} />
            )}
          </div>
        </section>
      ))}
      <HandoffBar
        crew="director"
        status={`${sc.length} beats · ${fmt(runtime)}`}
        approved={approvals.plan}
        handoff="Production plan handed to the Writer."
        approveLabel="Approve the plan"
        onApprove={() =>
          approve(
            "plan",
            "You approved the plan. The Writer has it and is drafting narration against each objective — the beat order and every duration stay exactly as you left them.",
            "Teaching plan approved",
            "script",
          )
        }
        onPushBack={() => {
          setThreadOpen(true);
          ask("The teaching plan needs another pass.");
          say(
            "Passed that to the Director. Tell me which beat is wrong — the order, the split, or what it is trying to teach — and nothing moves until you say so.",
          );
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Beat                                                                */
/* ------------------------------------------------------------------ */

function Beat({
  scene,
  index,
  start,
  active,
  ghost,
  last,
  onSelect,
  onNudge,
  onMove,
  onDragStart,
  onDragEnd,
  onSlot,
  onDrop,
}: {
  scene: Scene;
  index: number;
  start: number;
  active: boolean;
  ghost: boolean;
  last: boolean;
  onSelect: () => void;
  onNudge: (delta: number) => void;
  onMove: (dir: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onSlot: (slot: number | null) => void;
  onDrop: (slot: number) => void;
}) {
  /** Above the midpoint inserts before this beat, below it inserts after. */
  const slotFor = (e: DragEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    return after && !ghost ? index + 1 : index;
  };

  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onMove(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onMove(1);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onSlot(slotFor(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(slotFor(e));
      }}
      onClick={onSelect}
      className={cx(
        "relative rounded-[18px] border bg-card pt-3 pl-[26px]",
        "transition-[border-color,box-shadow,opacity] duration-[var(--t-fast)]",
        active ? "border-[color:var(--accent-ring)] shadow-sm" : "border-line-input",
        ghost && "opacity-40",
      )}
    >
      {/* Spine marker. */}
      <span
        aria-hidden
        className="absolute top-[21px] left-[-5.5px] h-[11px] w-[11px] rounded-full border-[1.5px] bg-card"
        style={{
          borderColor: active ? "var(--accent)" : "var(--color-line-mid)",
        }}
      />

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pr-3">
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-accent uppercase">
          Beat {num(index)}
        </span>
        <span className="min-w-0 flex-1 font-display text-[17px] font-semibold">
          {scene.title}
        </span>
        <span className="flex-none rounded-full border border-line-input bg-sunken px-2 py-[2px] text-[10.5px] text-t6">
          {pace(scene)}
        </span>

        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onGripKey}
          aria-label={`Reorder beat ${num(index)}. Press the up or down arrow key to move it.`}
          className="grid flex-none cursor-grab grid-cols-2 gap-[3px] rounded-md border-none bg-transparent p-1 active:cursor-grabbing"
        >
          {Array.from({ length: 6 }, (_, d) => (
            <span
              key={d}
              className="block h-[3px] w-[3px] rounded-full bg-t10"
              aria-hidden
            />
          ))}
        </button>
      </div>

      <p className="m-0 mt-1.5 pr-3 text-[13px] leading-[1.55] text-t5 pretty">
        <span className="text-t8">Viewer learns —</span> {scene.objective}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-div px-0 py-2.5 pr-3">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-t6">
          {scene.caption}
        </span>
        <span className="flex-none rounded-full border border-line-input bg-sunken px-2.5 py-[3px] font-mono text-[10px] tracking-[0.06em] text-t6 uppercase">
          {scene.anim}
        </span>
        <span className="flex-none font-mono text-[10px] text-t8 tabular-nums">
          {fmt(start)}
          {last ? "" : " →"}
        </span>
        <Stepper
          value={fmt(scene.dur)}
          onMinus={() => onNudge(-5)}
          onPlus={() => onNudge(5)}
          label={`Beat ${num(index)} duration`}
        />
      </div>
    </div>
  );
}

/** The 3px insertion marker. Takes up no space until a drag is over it. */
function InsertBar({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      aria-hidden
      className="ml-[26px] h-[3px] rounded-full"
      style={{ background: "var(--accent)" }}
    />
  );
}
