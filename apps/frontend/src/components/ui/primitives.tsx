"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { CREW } from "@/lib/crew";
import type { CrewId } from "@/lib/types";

export const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Graphite glass — the neutral primary. */
export function Graphite({ className, children, ...rest }: BtnProps) {
  return (
    <button {...rest} className={cx("glass-graphite", className)}>
      {children}
    </button>
  );
}

/** Accent glass — the single CTA per view. */
export function Accent({ className, children, ...rest }: BtnProps) {
  return (
    <button {...rest} className={cx("glass-accent", className)}>
      {children}
    </button>
  );
}

/**
 * The marketing primary: a graphite slab carrying an accent chip.
 * Squarer than the app's pills — this one is meant to be the heaviest
 * object on the page.
 */
export function ChipCTA({
  children,
  className,
  glyph,
  ...rest
}: BtnProps & { glyph?: ReactNode }) {
  return (
    <button
      {...rest}
      className={cx(
        "group inline-flex items-center gap-4 rounded-[15px] p-[5px] pl-6",
        "text-[15px] font-medium text-white",
        "transition-[filter,translate,scale] duration-[160ms] ease-decode",
        // Press compresses. `active:translate-y-0` only undid the hover,
        // so on touch — where nothing hovered — a tap felt like nothing.
        "hover:-translate-y-px hover:brightness-[1.14] active:scale-[0.97]",
        className,
      )}
      style={{
        background: "linear-gradient(180deg,#2C2C29,#141414)",
        border: "1px solid rgba(255,255,255,0.13)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.17), 0 10px 26px rgba(20,20,20,0.22)",
      }}
    >
      <span className="py-2">{children}</span>
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[15px] text-white"
        style={{
          background: "linear-gradient(180deg,var(--accent-top),var(--accent))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)",
        }}
        aria-hidden
      >
        {/* The glyph nudges, not the chip — rotating the chip turns the
            square into a diamond. */}
        <span className="block transition-[translate] duration-200 ease-decode group-hover:translate-x-[2px]">
          {glyph ?? <ArrowUpRight size={17} strokeWidth={2} aria-hidden />}
        </span>
      </span>
    </button>
  );
}

/** Quiet outlined pill — secondary actions. */
export function Ghost({ className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        "rounded-full border border-line-soft bg-card font-medium text-t5",
        "transition-[border-color,color,translate,scale] duration-[160ms] ease-decode",
        "hover:border-[#B9B9B4] hover:text-ink active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Marks                                                               */
/* ------------------------------------------------------------------ */

/** The Decode app mark. */
export function AppMark({
  size = 22,
  radius = 6,
  font = 13,
  gradient = false,
  className,
}: {
  size?: number;
  radius?: number;
  font?: number;
  gradient?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-none items-center justify-center font-display font-bold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: font,
        background: gradient
          ? "linear-gradient(180deg,#2E2E2B,#141414)"
          : "#141414",
        border: gradient ? "1px solid rgba(255,255,255,0.12)" : undefined,
        boxShadow: gradient
          ? "inset 0 1px 0 rgba(255,255,255,0.18),0 14px 32px rgba(30,30,28,0.22)"
          : undefined,
      }}
      aria-hidden
    >
      D
    </div>
  );
}

/** A specialist's coloured initial. */
export function CrewMark({
  crew,
  size = 28,
  approved = false,
  locked = false,
  className,
}: {
  crew: CrewId;
  size?: number;
  approved?: boolean;
  locked?: boolean;
  className?: string;
}) {
  const c = CREW[crew];
  const bg = approved
    ? "var(--accent)"
    : locked
      ? "transparent"
      : c.color;
  const ring = approved
    ? "var(--accent)"
    : locked
      ? "var(--color-line-mid)"
      : c.color;
  return (
    <div
      className={cx(
        "flex flex-none items-center justify-center font-display font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        border: `1px solid ${ring}`,
        color: locked ? "var(--color-t11)" : "#fff",
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {approved ? "✓" : c.initial}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

/** Never a bare spinner — always paired with an explanation. */
export function Spinner({
  size = 14,
  track = "#E0E0DC",
  className,
}: {
  size?: number;
  track?: string;
  className?: string;
}) {
  return (
    <div
      className={cx("spin flex-none rounded-full", className)}
      style={{
        width: size,
        height: size,
        border: `2px solid ${track}`,
        borderTopColor: "var(--accent)",
      }}
      role="progressbar"
      aria-label="Working"
    />
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className="relative h-[22px] w-[38px] flex-none rounded-full border-none transition-colors duration-150"
      style={{ background: on ? "#141414" : "#D8D8D2" }}
    >
      <motion.span
        className="absolute top-[2px] block h-[18px] w-[18px] rounded-full bg-white"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
        animate={{ left: on ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 620, damping: 34 }}
      />
    </button>
  );
}

/** − 0:32 + */
export function Stepper({
  value,
  onMinus,
  onPlus,
  size = "sm",
  label,
}: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  size?: "sm" | "lg";
  label: string;
}) {
  const pad = size === "lg" ? "px-3.5 py-[9px] text-sm" : "px-[9px] py-[3px] text-[13px]";
  return (
    <div
      className={cx(
        "flex flex-none items-center overflow-hidden border border-line bg-card",
        size === "lg" ? "w-full rounded-xl" : "rounded-full",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMinus();
        }}
        aria-label={`${label}: shorter`}
        className={cx(
          "border-none bg-transparent leading-none text-t7 transition-colors hover:bg-sunken-3 hover:text-ink",
          pad,
        )}
      >
        −
      </button>
      <div
        className={cx(
          "text-center font-mono",
          size === "lg" ? "flex-1 text-[13px]" : "w-[34px] text-[11px]",
        )}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlus();
        }}
        aria-label={`${label}: longer`}
        className={cx(
          "border-none bg-transparent leading-none text-t7 transition-colors hover:bg-sunken-3 hover:text-ink",
          pad,
        )}
      >
        +
      </button>
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  className?: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx("sel cursor-pointer", className)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Uppercase micro-label. */
export function Micro({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "text-xs font-medium uppercase tracking-[0.1em] text-t7",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Handwritten section kicker. */
export function Kicker({
  children,
  className,
  size = 19,
}: {
  children: ReactNode;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cx("font-hand text-accent", className)}
      style={{ fontSize: size }}
    >
      {children}
    </div>
  );
}

/** Product-stage label. The handwritten voice belongs to marketing; inside
 * the studio, labels use the editor's production vocabulary. */
export function StageKicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "font-mono text-[10px] font-medium tracking-[0.14em] text-accent-deep uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}
