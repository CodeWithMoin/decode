"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeft, Command, MessageSquare } from "lucide-react";
import { RailFrame } from "@/components/app/RailFrame";
import { StageRail } from "@/components/app/StageRail";
import { StudioNav } from "@/components/app/StudioNav";
import { CommandPalette, openCommandPalette } from "@/components/project/CommandPalette";
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

  const stageState = (id: TabId) => {
    const locked = isLocked(id, approvals);
    return { locked, badge: isApproved(id, approvals) ? "✓" : locked ? undefined : counts[id] };
  };

  // A locked stage is never inert and never a tooltip: it opens the production
  // room and gets explained.
  const selectStage = (id: TabId, locked: boolean) => (locked ? lockedNudge() : setTab(id));

  return (
    <div
      className="app-field flex min-h-dvh gap-3 p-0 lg:p-3"
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
        className="app-rail sticky top-3 hidden h-[calc(100dvh-24px)] w-[208px] flex-none flex-col rounded-[22px] p-3 lg:flex"
      >
      <RailFrame footer={
          <div className="studio-shell rounded-[16px] p-[3px]">
            <div className="studio-surface-muted rounded-[13px] p-3">
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
        <StageRail variant="rail" active={tab} state={stageState} onSelect={selectStage} />
        </div>

      </RailFrame>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
      {/* ============================ header ============================ */}
      <header className="panel-glass sticky top-0 z-30 border-b border-line-head lg:top-3 lg:mb-3 lg:rounded-[18px] lg:border lg:border-white/80 lg:shadow-sm">
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
            aria-label="Open project chat — ⌘J"
            className={cx(
              "flex h-9 flex-none items-center gap-2 rounded-full border px-2.5 transition-colors duration-[var(--t-fast)]",
              threadOpen
                ? "border-[var(--accent-ring)] bg-[var(--accent-tint)] text-accent-deep"
                : "border-line-input bg-card text-t6 hover:border-line-strong hover:text-ink",
            )}
          >
            <MessageSquare size={15} strokeWidth={1.8} aria-hidden />
            <span className="hidden text-[12px] font-medium xl:inline">Chat</span>
          </button>

          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open commands — Command K"
            className="flex h-9 flex-none items-center gap-2 rounded-full border border-line-input bg-card px-2.5 text-t6 transition-[border-color,color,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:border-line-strong hover:text-ink"
          >
            <Command size={15} strokeWidth={1.8} aria-hidden />
            <span className="hidden text-[12px] font-medium 2xl:inline">Commands</span>
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

      <StageRail variant="strip" active={tab} state={stageState} onSelect={selectStage} />

      <div
        className={cx(
          "project-room-stage flex min-h-0 flex-1 transition-transform duration-[var(--t-normal)] ease-decode",
          threadOpen && tab !== "edit" && "lg:-translate-x-8",
        )}
      >

        {/* ============================ stage ============================ */}
        <main className="min-w-0 flex-1">{children ?? <Stage />}</main>

      </div>

      </div>

      {/* ⌘K does, ⌘J chats. The palette is the control list, so nothing
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
