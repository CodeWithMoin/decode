"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { StageRail } from "@/components/app/StageRail";
import { ExportModal } from "@/components/project/ExportModal";
import { ProjectChatTab } from "@/components/project/ProjectChatDock";
import { ProducerDrawer } from "@/components/producer/ProducerDrawer";
import { Edit } from "@/components/project/stages/Edit";
import { Script } from "@/components/project/stages/Script";
import { TeachingPlan } from "@/components/project/stages/TeachingPlan";
import { Understanding } from "@/components/project/stages/Understanding";
import { CREW, STAGE_OWNER } from "@/lib/crew";
import { acts, fmt, isLocked, scriptWordCount, total } from "@/lib/derive";
import { changeProjectStage } from "@/lib/project-theme-transition";
import { useProjectViewportLock } from "@/lib/use-project-viewport-lock";
import { useStudio } from "@/store/studio";
import type { TabId } from "@/lib/types";
import { AppMark, StageKicker, cx } from "@/components/ui/primitives";

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
  useProjectViewportLock();
  const tab = useStudio((state) => state.tab);
  const sc = useStudio((state) => state.sc);
  const approvals = useStudio((state) => state.approvals);
  const source = useStudio((state) => state.source);
  const go = useStudio((state) => state.go);
  const setTab = useStudio((state) => state.setTab);
  const lockedNudge = useStudio((state) => state.lockedNudge);

  const runtime = useMemo(() => total(sc), [sc]);
  const words = useMemo(() => scriptWordCount(sc), [sc]);
  const editing = tab === "edit";
  const [exportOpen, setExportOpen] = useState(false);

  // One count per stage, each the thing that stage is actually about.
  const counts: Record<TabId, string> = {
    overview: "37",
    plan: `${acts(sc).length}`,
    script: `${words.toLocaleString()}`,
    edit: `${sc.length}`,
  };

  const stageState = (id: TabId) => {
    const locked = isLocked(id, approvals);
    return { locked, badge: isApproved(id, approvals) ? "✓" : locked ? undefined : counts[id] };
  };

  // A locked stage is never inert and never a tooltip: it opens the production
  // room and gets explained.
  const selectStage = (id: TabId, locked: boolean) =>
    locked ? lockedNudge() : changeProjectStage(tab, id, () => setTab(id));

  return (
    <div
      data-editing={editing || undefined}
      className={cx(
        "project-workspace app-field app-field-global flex min-h-dvh gap-0 p-0 lg:h-dvh lg:overflow-hidden",
        editing && "bg-[var(--nle-bg)]",
      )}
    >
      {/* No global rail inside a project. New decode, Home and the account menu
          are studio-level and off-task here, and the 80px gutter cost the work
          width it was asking for. Identity and the way out live in the header
          as one line. The project workflow is the stage bar beneath it.

          The header spans the window — it names the project, and the project
          is what everything below it belongs to, chat included. The stage bar
          does not span: it belongs to the stage, so it sits inside the column
          to the right of the conversation. */}
      <div className={cx("flex min-w-0 flex-1 flex-col lg:relative lg:z-[1] lg:h-dvh lg:overflow-hidden", editing ? "bg-[var(--nle-bg)]" : "lg:bg-sunken-2")}>
      {/* ============================ header ============================ */}
      <header className={cx("sticky top-0 z-30 border-b", editing ? "border-[var(--nle-line)] bg-[var(--nle-panel)] text-[var(--nle-text)]" : "panel-glass border-line-head")}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3 justify-self-start">
          {/* Icon-only on phones. The word "Projects" is the single widest
              thing in this row that carries no information the arrow does not,
              and at 390px it was the difference between fitting and scrolling. */}
          <button
            type="button"
            onClick={() => go("dashboard")}
            aria-label="Back to projects"
            className={cx(
              "flex min-h-9 min-w-9 flex-none items-center justify-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors duration-[var(--t-fast)] sm:min-w-0 sm:justify-start sm:px-3 lg:hidden",
              editing
                ? "border-[var(--nle-line)] bg-[var(--nle-panel-raised)] text-[var(--nle-muted)] hover:border-[var(--nle-line-strong)] hover:text-[var(--nle-text)]"
                : "border-line-input bg-card text-t6 hover:border-line-strong hover:text-ink",
            )}
          >
              <ArrowLeft size={14} weight="regular" aria-hidden />
            <span className="hidden sm:inline">Projects</span>
          </button>

          {/* Identity, the way back, and where you are — one line. */}
          <nav aria-label="Breadcrumb" className="flex min-w-0 max-w-[300px] items-center gap-2">
            <button
              type="button"
              onClick={() => go("dashboard")}
              aria-label="Decode — back to your studio"
              className={cx(
                "hidden flex-none items-center gap-2 rounded-full px-1 py-0.5 transition-transform duration-[var(--t-fast)] ease-decode hover:-translate-y-px lg:flex",
                editing && "text-[var(--nle-text)]",
              )}
            >
              <AppMark gradient size={24} radius={7} font={13} />
              <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
                Decode
              </span>
            </button>
            <span aria-hidden className={cx("hidden flex-none text-[13px] lg:inline", editing ? "text-[var(--nle-faint)]" : "text-t8")}>
              /
            </span>
            <span
              aria-current="page"
              className="min-w-0 truncate font-display text-[14.5px] font-semibold"
            >
              {source.title}
            </span>
          </nav>
          </div>

          <StageRail variant="header" active={tab} state={stageState} onSelect={selectStage} dark={editing} />

          <div className="flex min-w-0 items-center justify-self-end gap-3">
          <span className={cx("hidden flex-none rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] uppercase 2xl:inline", editing ? "border-[var(--nle-line)] bg-[var(--nle-panel-raised)] text-[var(--nle-muted)]" : "border-line-input bg-sunken text-t6")}>
            {source.ext} · {source.pages}
          </span>

          <span className={cx("hidden font-mono text-[10px] tracking-[0.1em] uppercase 2xl:inline", editing ? "text-[var(--nle-muted)]" : "text-t6")}>
            {fmt(runtime)} · {sc.length} scenes
          </span>



          {editing && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              aria-label="Open export settings"
              className="flex h-[31px] flex-none items-center rounded-full border border-transparent px-3 text-[11.5px] text-[var(--nle-muted)] transition-[background-color,border-color,color,transform] duration-[var(--t-fast)] hover:border-[var(--nle-line)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)] active:scale-[0.98]"
            >
              Export
            </button>
          )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ProducerDrawer />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* ============================ stage ============================ */}
          <main
            className={cx(
              "min-h-0 min-w-0 flex-1",
              tab === "edit" ? "overflow-y-auto lg:overflow-hidden" : "overflow-y-auto",
            )}
          >
            {children ?? <Stage />}
          </main>
        </div>
      </div>

      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />

      {/* Below lg only: the persistent column becomes an on-demand overlay. */}
      <ProjectChatTab />
    </div>
  );
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
