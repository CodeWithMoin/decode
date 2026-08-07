"use client";

import { useEffect, useRef } from "react";
import { CREW } from "@/lib/crew";
import type { CrewId } from "@/lib/types";
import { CrewMark, Ghost, Graphite, cx } from "@/components/ui/primitives";

/**
 * The handoff, in two parts.
 *
 * It used to be one pinned card carrying the specialist's message, their
 * reasoning and the approve controls — about 190px of opaque panel floating
 * over the stage the entire time you were reading it. Reserving a gutter
 * stopped content being hidden *permanently*, but it was still a slab sitting
 * on the work, on every tab.
 *
 * The card was conflating two different things:
 *
 * - **What the specialist said** — the message and the why. That is content.
 *   You read it once, at the top, before looking at what they made. Pinning it
 *   meant reading the conclusion while scrolling past the evidence.
 * - **The decision** — Approve and Push back. This is what the spec means by
 *   "Approve must always be reachable", and on its own it fits in one strip.
 *
 * So `HandoffBrief` sits in the flow at the top of a stage and `HandoffBar`
 * pins to the bottom. Same contract, a third of the footprint. A handoff
 * without a stated "Why" is still not finished.
 */

export function HandoffBrief({
  crew,
  message,
  why,
}: {
  crew: CrewId;
  message: string;
  why: string;
}) {
  const c = CREW[crew];

  return (
    <div className="studio-surface px-5 py-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2.5">
        <CrewMark crew={crew} size={26} />
        <span className="text-[13px] font-semibold">{c.name}</span>
        <span className="ml-auto font-mono text-[9.5px] tracking-[0.12em] text-t9 uppercase">
          {c.artifact}
        </span>
      </div>

      <p className="pretty m-0 max-w-[68ch] text-[14.5px] leading-[1.55] text-ink">
        {message}
      </p>

      <div
        className="mt-3 flex items-start gap-2.5 rounded-[12px] px-3 py-2.5"
        style={{ background: "var(--color-sunken-2)" }}
      >
        <div
          className="mt-[3px] h-[13px] w-[2px] flex-none rounded-full"
          style={{ background: c.color }}
          aria-hidden
        />
        <p className="pretty m-0 max-w-[72ch] text-[12.5px] leading-[1.6] text-ink-3">
          <span className="font-mono text-[9.5px] tracking-[0.12em] text-t7 uppercase">
            Why
          </span>{" "}
          {why}
        </p>
      </div>
    </div>
  );
}

/**
 * The gutter the pinned bar reserves for itself.
 *
 * Stages pad their bottom by `--handoff-h` so the bar never floats over the
 * last thing you were reading. That number used to be a guess — 84px — and a
 * guess is wrong the moment the status text wraps to a second line on a narrow
 * phone, which is exactly when the content underneath is most cramped. So the
 * bar measures itself and publishes its own height plus 24px of breathing room
 * (the `bottom-3` offset and a little air) onto the document element.
 *
 * The 84px in globals.css stays as the SSR and no-JS floor: removing the
 * inline property on unmount is what lets the stylesheet take over again when
 * a stage without a bar mounts.
 */
function useGutterReservation() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !("ResizeObserver" in window)) {
      return;
    }

    const root = document.documentElement;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      root.style.setProperty("--handoff-h", `${Math.ceil(h) + 24}px`);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      root.style.removeProperty("--handoff-h");
    };
  }, []);

  return ref;
}

export function HandoffBar({
  crew,
  status,
  approved,
  handoff,
  nextLabel,
  approveLabel,
  onApprove,
  onPushBack,
  secondaryLabel = "Request changes",
  approvedSecondaryLabel = "Discuss",
  approveDisabled = false,
}: {
  crew: CrewId;
  status: string;
  approved: boolean;
  handoff: string;
  nextLabel?: string;
  approveLabel: string;
  onApprove: () => void;
  onPushBack: () => void;
  secondaryLabel?: string;
  approvedSecondaryLabel?: string;
  approveDisabled?: boolean;
}) {
  const c = CREW[crew];
  const ref = useGutterReservation();

  return (
    <div
      ref={ref}
      className="sticky bottom-3 z-[4] mt-auto overflow-hidden rounded-[18px]"
      style={{
        border: `1px solid ${approved ? "var(--accent-ring)" : "var(--color-line-input)"}`,
        background: approved ? "var(--color-accent-card)" : "var(--color-card)",
        boxShadow: "var(--shadow-sticky-up)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <CrewMark crew={crew} size={26} approved={approved} />
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-ink">{c.name}</span>
          <span className="block truncate font-mono text-[8px] tracking-[0.1em] text-t7 uppercase">{c.artifact}</span>
        </span>

        <span className={cx("rounded-full px-2.5 py-1 font-mono text-[8.5px] tracking-[0.1em] uppercase", approved ? "bg-[var(--accent-tint)] text-accent-deep" : "bg-sunken text-t6")}>
          {status}
        </span>

        <span className="min-w-[180px] flex-1 text-[11.5px] leading-[1.45] text-t6">
          {approved ? handoff : nextLabel}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Ghost
            type="button"
            onClick={onPushBack}
            className="px-3.5 py-1.5 text-[12.5px] whitespace-nowrap"
          >
            {approved ? approvedSecondaryLabel : secondaryLabel}
          </Ghost>
          {!approved && (
            <Graphite
              onClick={onApprove}
              disabled={approveDisabled}
              className="px-4 py-1.5 text-[12.5px] font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approveLabel}
            </Graphite>
          )}
        </div>
      </div>
    </div>
  );
}
