"use client";

import { MessageSquare } from "lucide-react";
import { AppMark, cx } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";

/** The project-scoped edge tab for Chat with Decode. */
export function ProjectChatTab() {
  const open = useStudio((s) => s.threadOpen);
  const tab = useStudio((s) => s.tab);
  const toggleThread = useStudio((s) => s.toggleThread);
  const hasReviewDock = tab === "overview" || tab === "plan" || tab === "script";

  if (hasReviewDock) return null;

  return (
    <button
      type="button"
      onClick={toggleThread}
      aria-label="Open Project Chat — Command J"
      aria-expanded={open}
      aria-hidden={open || undefined}
      inert={open}
      className={cx(
        "header-glass fixed right-3 z-[70] flex min-h-12 items-center gap-2 rounded-full border border-white/80 p-1.5 pr-3 shadow-[var(--shadow-float)]",
        "transition-[opacity,transform,box-shadow] duration-[var(--t-normal)] ease-decode",
        "hover:-translate-y-px hover:shadow-[var(--shadow-hover)] active:scale-[0.98]",
        "bottom-3",
        open && "pointer-events-none translate-x-3 scale-[0.96] opacity-0",
      )}
    >
      <AppMark gradient size={34} radius={17} font={15} />
      <MessageSquare size={15} strokeWidth={1.7} aria-hidden className="text-t6" />
      <span className="text-[12.5px] font-semibold text-ink">Chat</span>
      <span className="rounded-full bg-white/70 px-2 py-1 font-mono text-[8px] tracking-[0.05em] text-t8 shadow-xs">
        ⌘J
      </span>
    </button>
  );
}
