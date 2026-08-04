"use client";

import { AppMark } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";

/**
 * The rail's fixed frame: identity at the top, account at the base, whatever
 * the current context needs in between.
 *
 * The studio and a project used to render two entirely separate rails, and the
 * measurement was blunt: opening a project changed **every single item** in the
 * sidebar — wordmark, primary action, nav rows, account card, all replaced at
 * once, nothing in common. That is why it read as landing in a different app
 * rather than moving within one. A person tracks continuity by what stays put,
 * and nothing stayed put.
 *
 * So the anchors live here, in one component both shells render, rather than in
 * two files that happen to agree today. The wordmark occupies the same pixels
 * before and after the jump, the account card holds the base, and only the
 * middle changes — which is exactly the part that *should* change, because it
 * is the part that describes where you are.
 */
export function RailFrame({
  children,
  footer,
  onLeave,
}: {
  children: React.ReactNode;
  /** Context-owned block above the account card — a source card, say. */
  footer?: React.ReactNode;
  /** Called when the wordmark is used, so a project can close itself first. */
  onLeave?: () => void;
}) {
  const go = useStudio((s) => s.go);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onLeave?.();
          go("dashboard");
        }}
        aria-label="Decode — back to your studio"
        className="mb-4 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-[var(--t-fast)] hover:bg-white/55"
      >
        <AppMark gradient size={24} radius={7} font={13} />
        <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
          Decode
        </span>
      </button>

      {children}

      <div className="mt-auto flex flex-col gap-2">
        {footer}

        <div className="flex items-center gap-2.5 rounded-[12px] border border-line-input bg-card p-2.5">
          <span
            aria-hidden
            className="grid h-[28px] w-[28px] flex-none place-items-center rounded-full font-display text-[11px] font-semibold text-white"
            style={{
              background: "linear-gradient(180deg,#2E2E2B,#141414)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            M
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">Mo</span>
            <span className="block truncate font-mono text-[9px] tracking-[0.1em] text-t9 uppercase">
              Private beta
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
