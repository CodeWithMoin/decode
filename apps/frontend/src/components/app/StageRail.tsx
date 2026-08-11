"use client";

import { Check, Lock } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
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
 * `variant="rail"` supports the legacy labelled column; `variant="strip"` is
 * the sticky project-page switcher beneath the project header. Four stages are
 * a linear production pipeline, not a global navigation menu.
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
  dark = false,
}: {
  variant: "rail" | "strip" | "header";
  active: TabId;
  state: (tab: TabId) => StageState;
  onSelect?: (tab: TabId, locked: boolean) => void;
  dark?: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant === "rail") return;
    stripRef.current
      ?.querySelector<HTMLElement>("[aria-current]")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active, variant]);

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
            {badge ?? (locked ? <Lock size={11} weight="regular" aria-label="Locked" /> : null)}
          </span>
        </>
      ) : (
        <>
          <span
            className={
              on
                ? "font-mono text-[9px] text-white tabular-nums"
                : dark
                  ? "font-mono text-[9px] text-[var(--nle-faint)] tabular-nums"
                  : "font-mono text-[9px] text-t6 tabular-nums"
            }
          >
            {ordinal}
          </span>
          {label}
          {badge && !locked && (
            <span
              className={
                on
                  ? "font-mono text-[9px] text-white tabular-nums"
                  : "font-mono text-[9px] text-accent-deep tabular-nums"
              }
            >
              {badge === "✓" ? (
                <span
                  className={[
                    "grid h-4 w-4 place-items-center rounded-full border",
                    on
                      ? "border-white/25 bg-white/15 text-white"
                      : "border-[var(--accent-line)] bg-[var(--accent-tint)] text-accent-deep",
                  ].join(" ")}
                >
                  <Check size={9} weight="bold" aria-label="Approved" />
                </span>
              ) : badge}
            </span>
          )}
          {locked && <Lock size={10} weight="regular" aria-label="Locked" />}
        </>
      );

    const className =
      variant === "rail"
        ? [
            "flex w-full items-center gap-2.5 rounded-full py-2 pr-3 pl-2 text-left transition-[background-color,box-shadow] duration-[var(--t-fast)]",
            on ? "bg-white shadow-[0_2px_10px_rgb(30_30_28_/_0.08)]" : onSelect ? "hover:bg-white/55" : "",
          ].join(" ")
        : variant === "header"
          ? [
              "flex flex-none items-center gap-1.5 rounded-full border border-transparent py-1.5 pr-2.5 pl-1.5 text-[11.5px] whitespace-nowrap",
              on
                ? "border-accent bg-[linear-gradient(180deg,var(--accent-top),var(--accent))] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.2)]"
                : locked
                  ? dark ? "text-[var(--nle-faint)]" : "text-t8"
                  : dark
                    ? "text-[var(--nle-muted)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)]"
                    : "text-ink-2 hover:bg-white",
            ].join(" ")
          : [
            "flex flex-none items-center gap-2 rounded-full border border-transparent py-1.5 pr-3 pl-1.5 text-[12.5px] whitespace-nowrap lg:flex-1 lg:justify-center",
            on
              ? "border-accent bg-[linear-gradient(180deg,var(--accent-top),var(--accent))] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.2),0_2px_10px_rgb(30_30_28_/_0.12)]"
              : locked
                ? dark ? "text-[var(--nle-faint)]" : "text-t8"
                : dark
                  ? "text-[var(--nle-muted)] hover:border-[var(--nle-line)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)]"
                  : "text-ink-2 hover:bg-white",
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
      <div
        ref={stripRef}
        className={[
          "rail-x sticky top-[var(--header-h)] z-20 flex gap-1.5 overflow-x-auto border-b px-3 py-2",
          dark
            ? "border-[var(--nle-line)] bg-[var(--nle-panel)]"
            : "border-line-strong bg-sunken-2",
        ].join(" ")}
      >
        {rows}
      </div>
    );
  }

  if (variant === "header") {
    return (
      <div ref={stripRef} className="stage-header-scroll flex max-w-[620px] min-w-0 justify-center gap-2.5 overflow-x-auto">
        {rows}
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((row) => (
        <li key={row.key}>{row}</li>
      ))}
    </ul>
  );
}
