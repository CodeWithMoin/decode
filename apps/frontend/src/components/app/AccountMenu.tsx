"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";

/**
 * The account boundary stays anchored at the base of the app rail.
 *
 * This deployment does not have users, sessions, billing, or sign-out yet, so
 * the menu states that honestly instead of rendering controls that cannot work.
 */
export function AccountMenu({ connected = false, placement = "above" }: { connected?: boolean; placement?: "above" | "right" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copySupportDetails = async () => {
    try {
      await navigator.clipboard.writeText([
        "Decode private beta",
        `Route: ${window.location.href}`,
        `Connected studio: ${connected ? "yes" : "no"}`,
        `Browser: ${navigator.userAgent}`,
      ].join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div ref={rootRef} onClick={(event) => event.stopPropagation()} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Open account menu"
        aria-expanded={open}
        className="studio-surface grid h-9 w-9 place-items-center rounded-full text-left shadow-xs transition-[border-color,box-shadow,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:border-line-strong hover:shadow-sm"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink font-display text-[11px] font-semibold text-white" aria-hidden>
          D
        </span>
      </button>

      {open && (
        <div className={`studio-shell absolute z-50 w-[248px] rounded-[16px] p-[3px] shadow-xl ${placement === "right" ? "bottom-0 left-[calc(100%+8px)]" : "right-0 bottom-[calc(100%+8px)]"}`}>
          <div className="studio-surface rounded-[13px] p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-sky-wash text-sky-deep" aria-hidden>
                <ShieldCheck size={15} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-ink">{connected ? "Private beta access" : "Local prototype"}</p>
                <p className="mt-1 text-[10.5px] leading-[1.55] text-t6">
                  {connected
                    ? "This deployment uses one studio workspace. Individual accounts, billing, and sign out are not connected yet."
                    : "This local studio is not synced to an account or workspace."}
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-line-head pt-3">
              <p className="font-mono text-[8.5px] tracking-[0.12em] text-t6 uppercase">Help with a problem</p>
              <p className="mt-1.5 text-[10.5px] leading-[1.55] text-t6">
                Copy the current route and browser details to include with a bug report.
              </p>
              <button type="button" onClick={() => void copySupportDetails()} className="mt-2.5 flex min-h-8 w-full items-center justify-center gap-2 rounded-full border border-line-input bg-sunken px-3 text-[11px] font-medium text-ink-2 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:bg-white">
                {copied ? <Check size={12} strokeWidth={1.9} aria-hidden /> : <Copy size={12} strokeWidth={1.8} aria-hidden />}
                {copied ? "Support details copied" : "Copy support details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
