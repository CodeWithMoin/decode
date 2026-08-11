"use client";

import { ChatCircle } from "@phosphor-icons/react";
import { AppMark, cx } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";

/** The project-scoped edge tab for Chat with Decode. */
export function ProjectChatTab() {
  const open = useStudio((s) => s.threadOpen);
  const toggleThread = useStudio((s) => s.toggleThread);

  return (
    <button
      type="button"
      onClick={toggleThread}
      aria-label="Open Project Chat — Command J"
      aria-expanded={open}
      aria-hidden={open || undefined}
      inert={open}
      className={cx(
        // Below lg only. From lg up Chat is a persistent project column.
        "header-glass fixed right-3 z-[70] flex h-12 w-12 items-center justify-center gap-2 rounded-full border border-white/80 p-1.5 shadow-[var(--shadow-float)] sm:w-auto sm:justify-start sm:pr-3 lg:hidden",
        "transition-[opacity,transform,box-shadow] duration-[var(--t-normal)] ease-decode",
        "hover:-translate-y-px hover:shadow-[var(--shadow-hover)] active:scale-[0.98]",
        "bottom-3",
        open && "pointer-events-none translate-x-3 scale-[0.96] opacity-0",
      )}
    >
      <AppMark gradient size={34} radius={17} font={15} />
      <ChatCircle size={15} weight="regular" aria-hidden className="hidden text-t6 sm:block" />
      <span className="hidden text-[12.5px] font-semibold text-ink sm:inline">Chat</span>
      <span className="hidden rounded-full bg-white/70 px-2 py-1 font-mono text-[8px] tracking-[0.05em] text-t8 shadow-xs sm:inline">
        ⌘J
      </span>
    </button>
  );
}
