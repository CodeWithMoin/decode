"use client";

import { Lock } from "lucide-react";
import { STAGES } from "@/lib/stages";
import type { TabId } from "@/lib/types";

export type StageState = {
  locked?: boolean;
  /** Right-hand mark in the rail: a count, a ✓, whatever the stage is about. */
  badge?: React.ReactNode;
};

/**
 * The stage list, rendered once for both shells.
 *
 * `variant="rail"` is the desktop column inside `RailFrame`; `variant="strip"`
 * is the scrollable row below the header under `lg`. A drawer is wrong for the
 * strip: five stages are a linear pipeline, not a menu, and the point of the
 * rail is showing where you are in it.
 *
 * Everything stateful arrives as props. This component knows nothing about the
 * store, which is why the connected app can render it without importing the
 * seeded one.
 *
 * With no `onSelect` the rows render as static markup rather than buttons —
 * that is the connected milestone, where a locked stage has no production room
 * to nudge you into and a button that does nothing is a dead end.
 */
export function StageRail({
  variant,
  active,
  state,
  onSelect,
}: {
  variant: "rail" | "strip";
  active: TabId;
  state: (tab: TabId) => StageState;
  onSelect?: (tab: TabId, locked: boolean) => void;
}) {
  const rows = STAGES.map(({ tab, label }, index) => {
    const { locked = false, badge } = state(tab);
    const on = tab === active;
    const ordinal = String(index + 1).padStart(2, "0");

    const inner =
      variant === "rail" ? (
        <>
          <span
            className={[
              "w-5 flex-none font-mono text-[9px] tabular-nums",
              on ? "text-accent-deep" : "text-t9",
            ].join(" ")}
          >
            {ordinal}
          </span>
          <span
            className={[
              "min-w-0 flex-1 truncate text-[13px]",
              locked ? "text-t9" : on ? "font-medium" : "text-ink-2",
            ].join(" ")}
          >
            {label}
          </span>
          <span className="flex-none font-mono text-[9.5px] text-t9 tabular-nums">
            {badge ?? (locked ? <Lock size={11} strokeWidth={1.8} aria-label="Locked" /> : null)}
          </span>
        </>
      ) : (
        <>
          <span className="font-mono text-[9px] text-t9 tabular-nums">{ordinal}</span>
          {label}
          {locked && <Lock size={10} strokeWidth={1.8} aria-label="Locked" />}
        </>
      );

    const className =
      variant === "rail"
        ? [
            "flex w-full items-center gap-2.5 rounded-full py-2 pr-3 pl-2 text-left transition-[background-color,box-shadow] duration-[var(--t-fast)]",
            on ? "bg-white shadow-[0_2px_10px_rgb(30_30_28_/_0.08)]" : onSelect ? "hover:bg-white/55" : "",
          ].join(" ")
        : [
            "flex flex-none items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-[12.5px] whitespace-nowrap",
            on
              ? "bg-white font-medium shadow-[0_2px_10px_rgb(30_30_28_/_0.08)]"
              : locked
                ? "text-t9"
                : "text-ink-2",
          ].join(" ");

    if (!onSelect) {
      return (
        <div key={tab} className={className} aria-current={on ? "step" : undefined}>
          {inner}
        </div>
      );
    }

    return (
      <button
        key={tab}
        type="button"
        // A locked stage is never inert and never a tooltip: the handler
        // decides, and in the prototype it opens the production room.
        onClick={() => onSelect(tab, locked)}
        aria-current={on ? "page" : undefined}
        className={className}
      >
        {inner}
      </button>
    );
  });

  if (variant === "strip") {
    return (
      <div className="panel-glass rail-x sticky top-[var(--header-h)] z-20 flex gap-1.5 overflow-x-auto border-b border-line-head px-3 py-2 lg:hidden">
        {rows}
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {rows.map((row) => (
        <li key={row.key}>{row}</li>
      ))}
    </ul>
  );
}
