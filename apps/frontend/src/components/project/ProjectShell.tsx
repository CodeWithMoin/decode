"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeft, Lock, MessageSquare } from "lucide-react";
import { RailFrame } from "@/components/app/RailFrame";
import { StudioNav } from "@/components/app/StudioNav";
import { CommandPalette } from "@/components/project/CommandPalette";
import { ProducerDrawer } from "@/components/producer/ProducerDrawer";
import { Edit } from "@/components/project/stages/Edit";
import { Export } from "@/components/project/stages/Export";
import { Script } from "@/components/project/stages/Script";
import { TeachingPlan } from "@/components/project/stages/TeachingPlan";
import { Understanding } from "@/components/project/stages/Understanding";
import { CREW, STAGE_OWNER } from "@/lib/crew";
import { acts, fmt, isLocked, scriptWordCount, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import type { TabId } from "@/lib/types";
import { Graphite, StageKicker, cx } from "@/components/ui/primitives";

/**
 * The project shell — header, gated rail, panel routing.
 *
 * The frame every stage renders inside. It owns three things and nothing else:
 * where you are (the rail) and what the cut currently is (runtime and scene
 * count in the header). Crew identity stays inside handoffs and receipts.
 *
 * Every number here is derived, never stored. Runtime is Σ durations, so
 * retiming or reordering a scene updates the header without anything having to
 * remember to tell it.
 */

const NAV: { tab: TabId; label: string }[] = [
  { tab: "overview", label: "Understanding" },
  { tab: "plan", label: "Teaching Plan" },
  { tab: "script", label: "Script" },
  { tab: "edit", label: "Edit" },
  { tab: "export", label: "Export" },
];

export function ProjectShell({ children }: { children?: React.ReactNode }) {
  const {
    tab,
    sc,
    approvals,
    source,
    go,
    setTab,
    lockedNudge,
    threadOpen,
    toggleThread,
  } = useStudio();

  const runtime = useMemo(() => total(sc), [sc]);
  const words = useMemo(() => scriptWordCount(sc), [sc]);
  usePlaybackClock();

  // One count per stage, each the thing that stage is actually about.
  const counts: Record<TabId, string> = {
    overview: "37",
    plan: `${acts(sc).length}`,
    script: `${words.toLocaleString()}`,
    edit: `${sc.length}`,
    export: fmt(runtime),
  };

  return (
    <div
      className="flex min-h-dvh bg-page"
    >
      {/* The rail runs the full height at the viewport edge, not tucked
          under the header. A shared frame only reads as continuity if the
          frame holds still — starting it below a 59px header dropped the
          wordmark and the account card on entry, which is what made this
          look like a different sidebar rather than the same one with new
          contents. The header spans the content column alone. */}
      {/* =========================== left rail =========================== */}
      <nav
        aria-label="Stages"
        className="panel-glass sticky top-0 hidden h-dvh w-[200px] flex-none flex-col border-r border-line-head p-3 lg:flex"
      >
      <RailFrame footer={
          <div className="rounded-[14px] border border-line-input bg-card p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded-[5px] border border-line-input bg-sunken px-1.5 py-[3px] font-mono text-[8.5px] text-t6">
                {source.ext}
              </span>
              <span className="truncate font-mono text-[9px] tracking-[0.08em] text-t9 uppercase">
                {source.pages}
              </span>
            </div>
            <div className="truncate text-[12px] font-medium">{source.title}</div>
            <div className="mt-0.5 truncate text-[11px] text-t6">{source.author}</div>
          </div>
      }>
        <StudioNav active="none" />

        <div className="mt-4 border-t border-line-head pt-4">
          <div className="mb-2 flex items-center justify-between px-2.5">
            <span className="font-mono text-[8.5px] tracking-[0.12em] text-t9 uppercase">
              Current project
            </span>
            <span className="font-mono text-[8.5px] text-t9">{fmt(runtime)}</span>
          </div>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {NAV.map(({ tab: id, label }, index) => {
            const locked = isLocked(id, approvals);
            const active = id === tab;
            const done = isApproved(id, approvals);

            return (
              <li key={id}>
                <button
                  type="button"
                  // A locked stage is never inert and never a tooltip: it
                  // opens the production room and gets explained.
                  onClick={() => (locked ? lockedNudge() : setTab(id))}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-full py-2 pr-3 pl-2 text-left transition-[background-color,box-shadow] duration-[var(--t-fast)]",
                    active
                      ? "bg-white shadow-[0_2px_10px_rgb(30_30_28_/_0.08)]"
                      : "hover:bg-white/55",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "w-5 flex-none font-mono text-[9px] tabular-nums",
                      active ? "text-accent-deep" : "text-t9",
                    ].join(" ")}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={[
                      "min-w-0 flex-1 truncate text-[13px]",
                      locked ? "text-t9" : active ? "font-medium" : "text-ink-2",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                  <span className="flex-none font-mono text-[9.5px] text-t9 tabular-nums">
                    {done ? "✓" : locked ? <Lock size={11} strokeWidth={1.8} aria-label="Locked" /> : counts[id]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </div>

      </RailFrame>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
      {/* ============================ header ============================ */}
      <header className="panel-glass sticky top-0 z-30 border-b border-line-head">
        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* Icon-only on phones. The word "Projects" is the single widest
              thing in this row that carries no information the arrow does not,
              and at 390px it was the difference between fitting and scrolling. */}
          <button
            type="button"
            onClick={() => go("dashboard")}
            aria-label="Back to projects"
            className="flex min-h-9 min-w-9 flex-none items-center justify-center gap-1.5 rounded-full border border-line-input bg-card px-2.5 text-[12.5px] text-t6 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:text-ink sm:min-w-0 sm:justify-start sm:px-3 lg:hidden"
          >
            <ArrowLeft size={14} strokeWidth={1.8} aria-hidden />
            <span className="hidden sm:inline">Projects</span>
          </button>

          <span className="min-w-0 truncate font-display text-[14.5px] font-semibold">
            {source.title}
          </span>

          <span className="hidden flex-none rounded-full border border-line-input bg-sunken px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-t6 uppercase sm:inline">
            Local session · not synced
          </span>

          <span className="ml-auto hidden font-mono text-[10px] tracking-[0.1em] text-t6 uppercase md:inline">
            {fmt(runtime)} · {sc.length} scenes
          </span>


          <button
            type="button"
            onClick={toggleThread}
            aria-pressed={threadOpen}
            aria-label="Open production room — ⌘J"
            className={cx(
              "flex h-9 flex-none items-center gap-2 rounded-full border px-2.5 transition-colors duration-[var(--t-fast)]",
              threadOpen
                ? "border-[var(--accent-ring)] bg-[var(--accent-tint)] text-accent-deep"
                : "border-line-input bg-card text-t6 hover:border-line-strong hover:text-ink",
            )}
          >
            <MessageSquare size={15} strokeWidth={1.8} aria-hidden />
            <span className="hidden text-[12px] font-medium xl:inline">Production room</span>
          </button>

          <Graphite
            type="button"
            onClick={() =>
              isLocked("export", approvals) ? lockedNudge() : setTab("export")
            }
            aria-label={
              isLocked("export", approvals)
                ? "Export is locked until the script is approved"
                : "Open export settings"
            }
            className="flex-none px-4 py-2 text-[13px] font-medium"
          >
            Export
          </Graphite>
        </div>
      </header>

      {/* Stages below lg.
          A drawer is wrong here: the five stages are a linear pipeline, not a
          menu, and the whole point of the rail is showing where you are in it.
          A scrollable strip keeps that reading, and keeps the gate visible. */}
      <div className="panel-glass rail-x sticky top-[var(--header-h)] z-20 flex gap-1.5 overflow-x-auto border-b border-line-head px-3 py-2 lg:hidden">
        {NAV.map(({ tab: id, label }, index) => {
          const locked = isLocked(id, approvals);
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => (locked ? lockedNudge() : setTab(id))}
              aria-current={active ? "page" : undefined}
              className={[
                "flex flex-none items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-[12.5px] whitespace-nowrap",
                active
                  ? "bg-white font-medium shadow-[0_2px_10px_rgb(30_30_28_/_0.08)]"
                  : locked
                    ? "text-t9"
                    : "text-ink-2",
              ].join(" ")}
            >
              <span className="font-mono text-[9px] text-t9 tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              {label}
              {locked && <Lock size={10} strokeWidth={1.8} aria-label="Locked" />}
            </button>
          );
        })}
      </div>

      <div
        className={cx(
          "flex min-h-0 flex-1",
          "transition-[padding] duration-[250ms] ease-decode",
          threadOpen && "lg:pr-[404px]",
        )}
      >

        {/* ============================ stage ============================ */}
        <main className="min-w-0 flex-1">{children ?? <Stage />}</main>

      </div>

      </div>

      {/* ⌘K does, ⌘J discusses. The palette is the control list, so nothing
          can appear in it that is not already a real action. */}
      <CommandPalette />

      {/* Global overlay, mounted once and above the sticky header. */}
      <ProducerDrawer />
    </div>
  );
}

/**
 * The playback clock, owned here and nowhere else.
 *
 * `tick()` existed in the store with no caller, so the playhead never advanced.
 * It lives in the shell rather than in Canvas or Timeline because both render
 * during Edit — if each started its own interval the playhead would advance at
 * double speed, and the bug would only appear on one stage.
 */
function usePlaybackClock() {
  const playing = useStudio((s) => s.playing);
  const tick = useStudio((s) => s.tick);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [playing, tick]);
}

function Stage() {
  const tab = useStudio((s) => s.tab);

  switch (tab) {
    case "overview":
      return <Understanding />;
    case "plan":
      return <TeachingPlan />;
    case "script":
      return <Script />;
    case "edit":
      return <Edit />;
    case "export":
      return <Export />;
    default:
      return <StagePlaceholder />;
  }
}

/** Only the three gated stages carry an approval. */
function isApproved(
  tab: TabId,
  a: { understanding: boolean; plan: boolean; script: boolean },
): boolean {
  if (tab === "overview") return a.understanding;
  if (tab === "plan") return a.plan;
  if (tab === "script") return a.script;
  return false;
}

function StagePlaceholder() {
  const tab = useStudio((s) => s.tab);
  const owner = STAGE_OWNER[tab];
  return (
    <div className="grid min-h-[60vh] place-items-center p-8">
      <div className="text-center">
        <span
          className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-full font-display text-[13px] font-semibold text-white"
          style={{ background: owner.color }}
          aria-hidden
        >
          {owner.initial}
        </span>
        <StageKicker>In production</StageKicker>
        <div className="mt-1 font-display text-[19px] font-semibold">
          {owner.name}&rsquo;s stage is being built.
        </div>
        <div className="mt-1.5 text-[13px] text-t6">
          Working on {CREW[owner.id].artifact.toLowerCase()}.
        </div>
      </div>
    </div>
  );
}
