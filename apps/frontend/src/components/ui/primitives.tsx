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

/** Trailing action island shared by marketing and studio primary controls. */
export function ButtonArrow({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "icon-island h-8 w-8 transition-transform duration-[var(--t-fast)] ease-decode group-hover:translate-x-0.5 group-hover:-translate-y-px",
        className,
      )}
    >
      <ArrowUpRight size={15} strokeWidth={1.8} />
    </span>
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
export function CrewGlyph({ crew, size = 18 }: { crew: CrewId; size?: number }) {
  const shared = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (crew === "producer") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="7.2" opacity="0.5" />
        <path d="M12 4.8V2.8M19.2 12h2M12 19.2v2M4.8 12h-2" />
        <path d="M7.1 7.1 5.7 5.7M16.9 7.1l1.4-1.4M16.9 16.9l1.4 1.4M7.1 16.9l-1.4 1.4" opacity="0.72" />
      </svg>
    );
  }

  if (crew === "director") {
    return (
      <svg {...shared}>
        <path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4" />
        <circle cx="12" cy="12" r="3.1" />
        <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (crew === "writer") {
    return (
      <svg {...shared}>
        <path d="m6 17 1.1-4.2L16.8 3l4.2 4.2-9.8 9.7L7 18Z" />
        <path d="m14.8 5 4.2 4.2M7.2 12.8l4 4M5 21h14" opacity="0.72" />
      </svg>
    );
  }

  if (crew === "motion") {
    return (
      <svg {...shared}>
        <path d="M4 17c2.8-8.5 7.2 1 10-7 1.1-3.1 3.2-4.2 6-3" />
        <rect x="2.8" y="15.8" width="2.4" height="2.4" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="9.8" y="10.8" width="2.4" height="2.4" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="18.8" y="5.8" width="2.4" height="2.4" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" opacity="0.52" />
      <path d="M9 4v16M15.5 9.5v5" />
      <path d="m13.8 11.2 1.7-1.7 1.7 1.7M13.8 12.8l1.7 1.7 1.7-1.7" />
    </svg>
  );
}

/** A specialist's coloured role mark. */
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
      {approved ? "✓" : <CrewGlyph crew={crew} size={Math.round(size * 0.64)} />}
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
        className="absolute top-[2px] left-[2px] block h-[18px] w-[18px] rounded-full bg-white"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
        animate={{ x: on ? 16 : 0 }}
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
