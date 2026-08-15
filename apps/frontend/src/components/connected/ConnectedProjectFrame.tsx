"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppMark, cx } from "@/components/ui/primitives";
import { ExportModal } from "@/components/project/ExportModal";
import { ProjectChatTab } from "@/components/project/ProjectChatDock";
import { ProducerDrawer } from "@/components/producer/ProducerDrawer";
import { useConnectedProjectSnapshot } from "@/components/connected/ConnectedProjectViewport";
import { useStudio } from "@/store/studio";
import type { StudioSnapshot, TabId } from "@/lib/types";

export function ConnectedProjectFrame({
  studio,
  activeStage,
  statusLabel,
  loading,
  fill = false,
  onExport,
  children,
}: {
  // Callers still pass projectId; the frame no longer needs it (the stage rail
  // and the continuous toggle that used it are both gone).
  projectId?: string;
  studio: StudioSnapshot | null;
  activeStage: TabId;
  statusLabel: string;
  loading: boolean;
  fill?: boolean;
  onExport?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [exportOpen, setExportOpen] = useState(false);
  const { snapshot, setSnapshot } = useConnectedProjectSnapshot();
  const stableStudio = studio ?? snapshot;
  useLayoutEffect(() => {
    if (studio) setSnapshot(studio);
  }, [setSnapshot, studio]);
  useLayoutEffect(() => {
    useStudio.setState({ screen: "project", tab: activeStage });
  }, [activeStage]);
  const sourceCount = stableStudio?.sources.length;

  // The cutting room is dark, and the whole shell goes with it — same as
  // ProjectShell. Derived from the stage rather than from whether the scenes
  // have arrived, which is the difference between opening dark and flashing
  // white first: the header paints before any fetch resolves.
  const editing = activeStage === "edit";

  return (
    <div
      data-editing={editing || undefined}
      className={cx(
        "app-field app-field-global min-h-dvh p-0 lg:h-dvh lg:overflow-hidden",
        editing && "bg-[var(--nle-bg)]",
      )}
    >
      {/* No global rail inside a project.
          The studio's rail carried a wordmark, New decode, Home and the account
          menu. Inside a project every one of those is either off-task or
          duplicated by something else in this header, and the 80px gutter cost
          the work the width it was asking for. Identity and the way out move
          into the header, where they read as one line instead of a column. */}
      <div
        className={cx(
          "min-w-0 lg:relative lg:z-[1] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden",
          editing ? "bg-[var(--nle-bg)]" : "lg:bg-sunken-2",
        )}
      >
        <header
          className={cx(
            "sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-4 py-2.5",
            editing
              ? "border-[var(--nle-line)] bg-[var(--nle-panel)] text-[var(--nle-text)]"
              : "panel-glass border-line-head",
          )}
        >
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
            <span
              aria-hidden
              className={cx(
                "hidden flex-none text-[13px] lg:inline",
                editing ? "text-[var(--nle-faint)]" : "text-t8",
              )}
            >
              /
            </span>
            <span
              aria-current="page"
              className="min-w-0 truncate font-display text-[14.5px] font-semibold"
            >
              {stableStudio?.project.title ?? (loading ? "Opening project" : "Decode project")}
            </span>
          </nav>
          </div>

          <div className="flex min-w-0 items-center justify-self-end gap-3">
          <span
            className={cx(
              "hidden rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] uppercase 2xl:inline",
              editing
                ? "border-[var(--nle-line)] bg-[var(--nle-panel-raised)] text-[var(--nle-muted)]"
                : "border-line-input bg-sunken text-t6",
            )}
          >
            {statusLabel}
          </span>
          <span
            className={cx(
              "hidden font-mono text-[9px] tracking-[0.1em] uppercase 2xl:inline",
              editing ? "text-[var(--nle-muted)]" : "text-t6",
            )}
          >
            {sourceCount === undefined
              ? "Checking sources"
              : `${sourceCount} source${sourceCount === 1 ? "" : "s"}`}
          </span>
          {editing && (
            <button
              type="button"
              onClick={() => onExport ? onExport() : setExportOpen(true)}
              aria-label={onExport ? "Export video" : "Open export settings showcase"}
              className="flex h-[31px] flex-none items-center rounded-full border border-transparent px-3 text-[11.5px] text-[var(--nle-muted)] transition-[background-color,border-color,color,transform] duration-[var(--t-fast)] hover:border-[var(--nle-line)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)] active:scale-[0.98]"
            >
              Export
            </button>
          )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <ProducerDrawer />
          <div className={cx("min-h-0 min-w-0 flex-1", fill ? "lg:overflow-hidden" : "lg:overflow-y-auto")}>
            {children}
          </div>
        </div>
      </div>
      {!onExport && <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />}
      <ProjectChatTab />
    </div>
  );
}
