"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { RailFrame } from "@/components/app/RailFrame";
import { StudioNav, type StudioNavId } from "@/components/app/StudioNav";
import { AppMark } from "@/components/ui/primitives";

/**
 * The application shell.
 *
 * Dashboard and New Decode use the compact global form of the studio rail. A
 * project expands the same anchors into a labelled production-stage rail: the
 * density changes because the context gains a workflow, not because the user
 * entered a different product.
 *
 * "New decode" lives here as an ordinary row rather than a hero button. It was
 * `ChipCTA` — the landing page's 51px hero CTA — which made the loudest pixel
 * on the dashboard a button you press once a week, louder than the greeting and
 * louder than the work itself. In an app the primary action is always present,
 * which is exactly why it does not need to shout.
 */

export function AppShell({
  children,
  active = "home",
  connected = false,
}: {
  children: React.ReactNode;
  /** "none" for screens that are not a nav destination, e.g. New Decode —
   *  highlighting Home while you are somewhere else is a lie about location. */
  active?: StudioNavId;
  connected?: boolean;
}) {
  const [menu, setMenu] = useState(false);

  // Close on Esc, and never leave the drawer open behind a resize into the
  // desktop layout — a hidden-but-open drawer traps focus invisibly.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const onResize = () => window.innerWidth >= 1024 && setMenu(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menu]);

  const rail = (mobile: boolean) => (
      <nav
        aria-label="Studio"
        onClick={mobile ? () => setMenu(false) : undefined}
        className={
          mobile
            ? "app-rail relative flex h-dvh w-[264px] max-w-[86vw] flex-col rounded-r-[22px] p-4"
            : "app-rail app-rail-global sticky top-0 z-40 hidden h-dvh w-[80px] flex-none flex-col rounded-none border-0 p-2 lg:flex"
        }
      >
        <RailFrame connected={connected} compact={!mobile} onLeave={mobile ? () => setMenu(false) : undefined}>
          {mobile && (
            <button
              type="button"
              onClick={() => setMenu(false)}
              aria-label="Close navigation"
              className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-[9px] text-t6 transition-colors hover:bg-sunken hover:text-ink"
            >
              <X size={15} strokeWidth={1.8} aria-hidden />
            </button>
          )}

        <StudioNav active={active} connected={connected} compact={!mobile} />

        </RailFrame>
      </nav>
  );

  return (
    <div className="app-field app-field-global flex min-h-dvh gap-0 p-0 lg:h-dvh lg:overflow-hidden">
      {rail(false)}

      {/* Below lg the rail is hidden, so without this the app had no
          navigation at all on a tablet or a phone — you could open a screen
          and never leave it. */}
      {menu && (
        <div className="fixed inset-0 z-40 flex p-2 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/25 backdrop-blur-sm"
            onClick={() => setMenu(false)}
            aria-hidden
          />
          <div className="relative shadow-[var(--shadow-drawer)]">
            {rail(true)}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1 lg:relative lg:z-[1] lg:mt-2 lg:mr-2 lg:h-[calc(100dvh-8px)] lg:overflow-y-auto lg:rounded-t-[22px] lg:bg-sunken-2 lg:shadow-xl">
        <div className="app-mobile-header sticky top-2 z-30 mx-2 mt-2 flex items-center gap-2 rounded-full px-2.5 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="Open navigation"
            aria-expanded={menu}
            className="grid h-9 w-9 place-items-center rounded-full bg-card text-t6 shadow-xs transition-[color,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:text-ink"
          >
            <Menu size={16} strokeWidth={1.8} aria-hidden />
          </button>
          <AppMark gradient size={22} radius={6} font={12} />
          <span className="font-display text-[14px] font-semibold">Decode</span>
        </div>
        {children}
      </div>
    </div>
  );
}
