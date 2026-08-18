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
  exportDisabled = false,
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
  exportDisabled?: boolean;
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

  // Edit keeps a distinct workstation layout, but its chrome uses the same
  // warm paper material as every other project surface. The authored 16:9
  // frame remains the only cinematic surface.
  const editing = activeStage === "edit";

  return (
    <div
      data-editing={editing || undefined}
      className="app-field app-field-global min-h-dvh w-full overflow-x-hidden p-0 lg:h-dvh lg:overflow-hidden"
    >
      {/* No global rail inside a project.
          The studio's rail carried a wordmark, New decode, Home and the account
          menu. Inside a project every one of those is either off-task or
          duplicated by something else in this header, and the 80px gutter cost
          the work the width it was asking for. Identity and the way out move
          into the header, where they read as one line instead of a column. */}
      <div
        className={cx(
          "min-w-0 lg:relative lg:z-[1] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden lg:bg-sunken-2",
        )}
      >
        <header
          className={cx(
            "panel-glass sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line-head px-4 py-2.5",
          )}
        >
          <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <button
            onClick={() => router.push("/studio")}
            aria-label="Back to projects"
              className="grid h-9 w-9 place-items-center rounded-full border border-line-input bg-card text-t6 transition-transform duration-[var(--t-fast)] active:scale-[0.97] lg:hidden"
          >
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
              className="hidden flex-none text-[13px] text-t8 lg:inline"
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
            className="hidden rounded-full border border-line-input bg-sunken px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-t6 uppercase 2xl:inline"
          >
            {statusLabel}
          </span>
          <span
            className="hidden font-mono text-[9px] tracking-[0.1em] text-t6 uppercase 2xl:inline"
          >
            {sourceCount === undefined
              ? "Checking sources"
              : `${sourceCount} source${sourceCount === 1 ? "" : "s"}`}
          </span>
          {editing && (
            <button
              type="button"
              onClick={() => onExport ? onExport() : setExportOpen(true)}
              disabled={exportDisabled}
              aria-label={onExport ? "Export video" : "Open export settings showcase"}
              className="flex h-[31px] flex-none items-center rounded-full bg-ink px-3.5 text-[11.5px] font-medium text-white shadow-xs transition-[background-color,transform] duration-[var(--t-fast)] hover:bg-ink-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
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
