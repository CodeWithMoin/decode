"use client";

import { useRouter } from "next/navigation";
import { AccountMenu } from "@/components/app/AccountMenu";
import { AppMark } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";

/**
 * The rail's fixed frame: identity at the top, account access at the base, and
 * whatever the current context needs between them.
 *
 * The studio and a project used to render two entirely separate rails, and the
 * measurement was blunt: opening a project changed **every single item** in the
 * sidebar — wordmark, primary action, and nav rows all replaced at
 * once, nothing in common. That is why it read as landing in a different app
 * rather than moving within one. A person tracks continuity by what stays put,
 * and nothing stayed put.
 *
 * So the anchors live here, in one component both shells render, rather than in
 * two files that happen to agree today. The compact global rail expands when a
 * project adds its labelled stage workflow; anchor order and behavior stay put.
 */
export function RailFrame({
  children,
  footer,
  onLeave,
  connected = false,
  compact = false,
}: {
  children: React.ReactNode;
  /** Context-owned block at the base of the rail — a source card, say. */
  footer?: React.ReactNode;
  /** Called when the wordmark is used, so a project can close itself first. */
  onLeave?: () => void;
  /** On the connected routes the wordmark navigates rather than switching screens. */
  connected?: boolean;
  /** Compact global rails show the mark and account as icon-only anchors. */
  compact?: boolean;
}) {
  const router = useRouter();
  const go = useStudio((s) => s.go);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onLeave?.();
          if (connected) router.push("/studio");
          else go("dashboard");
        }}
        aria-label="Decode — back to your studio"
        className={compact
          ? "mb-5 flex w-full items-center justify-center rounded-[12px] py-1.5 transition-[background-color,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:bg-white/70"
          : "mb-5 flex items-center gap-2.5 rounded-full px-2 py-1.5 text-left transition-[background-color,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:bg-white/70"}
      >
        <AppMark gradient size={compact ? 32 : 24} radius={compact ? 9 : 7} font={compact ? 16 : 13} />
        {!compact && <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">Decode</span>}
      </button>

      {children}

      <div className="mt-auto flex flex-col gap-2">
        {footer}
        <div className={compact ? "flex justify-center" : "flex justify-start px-1"}>
          <AccountMenu connected={connected} placement={compact ? "right" : "above"} />
        </div>
      </div>
    </>
  );
}
