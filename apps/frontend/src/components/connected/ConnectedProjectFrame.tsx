"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StageRail, type StageState } from "@/components/app/StageRail";
import { AppMark, cx } from "@/components/ui/primitives";
import { decodeApi } from "@/lib/decode-api";
import { useProjectViewportLock } from "@/lib/use-project-viewport-lock";
import type { StudioSnapshot, TabId } from "@/lib/types";

const ROUTES: Partial<Record<TabId, string>> = {
  overview: "understanding",
  plan: "teaching-plan",
};

const LOCKED_NOTES: Record<TabId, string> = {
  overview: "Understanding is available now.",
  plan: "Approve the Production Brief before the Director shapes the Teaching Plan.",
  script: "Script becomes available after the connected Writing stage is built.",
  edit: "Edit becomes available after a connected Script exists.",
};

export function connectedStageState(studio: StudioSnapshot | null) {
  const brief = studio?.artifacts.find((item) => item.artifact_type === "production_brief");
  const plan = studio?.artifacts.find((item) => item.artifact_type === "teaching_plan");
  const briefApproved = Boolean(brief?.approved_version_id);
  const planApproved = Boolean(plan?.approved_version_id);

  return (tab: TabId): StageState => {
    if (tab === "overview") return { badge: briefApproved ? "✓" : undefined };
    if (tab === "plan") {
      return { locked: !briefApproved, badge: planApproved ? "✓" : undefined };
    }
    return { locked: true };
  };
}

/**
 * Whether finishing one stage starts the next one.
 *
 * It lives in the shared header rather than on a stage, because it governs the
 * whole production and the creator needs it reachable *before* the next stage
 * spends anything. Optimistic: the switch is the creator's own action, so it
 * reads as immediate and rolls back only if the server disagrees.
 */
function ContinuousToggle({
  projectId,
  studio,
}: {
  projectId: string;
  studio: StudioSnapshot | null;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const server = studio?.project.auto_continue;
  if (server === undefined) return <span className="ml-auto" />;
  const on = override ?? server;

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setOverride(next);
    setBusy(true);
    try {
      await decodeApi.setAutoContinue(projectId, next);
    } catch {
      setOverride(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void toggle()}
      aria-pressed={on}
      disabled={busy}
      title={
        on
          ? "Each stage starts the next one on its own. Switch off to review every stage before the production continues."
          : "The production stops after each stage so you can review it. Switch on to let each stage start the next."
      }
      className="ml-auto hidden items-center gap-1.5 rounded-full border border-line-input bg-sunken px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-t6 uppercase disabled:opacity-60 sm:inline-flex"
    >
      <span
        aria-hidden
        className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-accent-deep" : "bg-line-strong")}
      />
      {on ? "Continuous" : "Stage by stage"}
    </button>
  );
}

export function ConnectedProjectFrame({
  projectId,
  studio,
  activeStage,
  statusLabel,
  loading,
  children,
}: {
  projectId: string;
  studio: StudioSnapshot | null;
  activeStage: TabId;
  statusLabel: string;
  loading: boolean;
  children: ReactNode;
}) {
  useProjectViewportLock();
  const router = useRouter();
  const [note, setNote] = useState("");
  const state = connectedStageState(studio);
  const sourceCount = studio?.sources.length;

  const selectStage = (tab: TabId, locked: boolean) => {
    if (locked || !ROUTES[tab]) {
      setNote(LOCKED_NOTES[tab]);
      return;
    }
    setNote("");
    router.push(`/studio/projects/${projectId}/${ROUTES[tab]}`);
  };

  return (
    <div className="app-field app-field-global min-h-dvh p-0 lg:h-dvh lg:overflow-hidden">
      {/* No global rail inside a project.
          The studio's rail carried a wordmark, New decode, Home and the account
          menu. Inside a project every one of those is either off-task or
          duplicated by something else in this header, and the 80px gutter cost
          the work the width it was asking for. Identity and the way out move
          into the header, where they read as one line instead of a column. */}
      <div className="min-w-0 lg:relative lg:z-[1] lg:h-dvh lg:overflow-y-auto lg:bg-sunken-2">
        <header className="panel-glass sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-line-head px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <button onClick={() => router.push("/studio")} aria-label="Back to projects" className="grid h-9 w-9 place-items-center rounded-full border border-line-input bg-card lg:hidden">
            <ArrowLeft size={14} />
          </button>
          {/* Identity, the way back, and where you are — one line. */}
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => router.push("/studio")}
              aria-label="Decode — back to your studio"
              className="hidden flex-none items-center gap-2 rounded-full px-1 py-0.5 transition-transform duration-[var(--t-fast)] ease-decode hover:-translate-y-px lg:flex"
            >
              <AppMark gradient size={24} radius={7} font={13} />
              <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
                Decode
              </span>
            </button>
            <span aria-hidden className="hidden flex-none text-[13px] text-t8 lg:inline">
              /
            </span>
            <span
              aria-current="page"
              className="min-w-0 truncate font-display text-[14.5px] font-semibold"
            >
              {studio?.project.title ?? (loading ? "Opening project" : "Decode project")}
            </span>
          </nav>
          </div>

          <StageRail variant="header" active={activeStage} state={state} onSelect={selectStage} />

          <div className="flex min-w-0 items-center justify-self-end gap-3">
          <span className="hidden rounded-full border border-line-input bg-sunken px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-t6 uppercase 2xl:inline">
            {statusLabel}
          </span>
          <span className="hidden font-mono text-[9px] tracking-[0.1em] text-t6 uppercase 2xl:inline">
            {sourceCount === undefined
              ? "Checking sources"
              : `${sourceCount} source${sourceCount === 1 ? "" : "s"}`}
          </span>
          <ContinuousToggle projectId={projectId} studio={studio} />
          </div>
        </header>

        {note && (
          <div role="status" className="mx-4 mt-3 rounded-xl border border-line-input bg-card px-4 py-3 text-[12px] leading-[1.55] text-t6 sm:mx-6 lg:mx-8">
            <span className="font-mono text-[8.5px] tracking-[0.1em] text-t8 uppercase">Production note</span>
            <span className="ml-2">{note}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
