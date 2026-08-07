"use client";

import { House, Plus } from "lucide-react";
import { CreateMark } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";
import { useRouter } from "next/navigation";

export type StudioNavId = "home" | "none";

const ITEMS = [
  { id: "home", label: "Home", icon: House, target: null },
] as const;

/** Stable global navigation used both outside and inside a project. */
export function StudioNav({ active = "none", connected = false, compact = false }: { active?: StudioNavId; connected?: boolean; compact?: boolean }) {
  const router = useRouter();
  const go = useStudio((s) => s.go);
  const newDecode = useStudio((s) => s.newDecode);

  const openDashboardSection = (target: string | null) => {
    if (connected) {
      router.push(target ? `/studio#${target}` : "/studio");
      return;
    }
    go("dashboard");
    if (!target) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          newDecode();
          if (connected) router.push("/studio/new");
        }}
        className={compact
          ? "group mb-5 flex w-full flex-col items-center gap-1.5 rounded-[12px] py-1.5 text-[10px] font-medium text-accent-deep"
          : "glass-accent group mb-5 flex min-h-10 w-full items-center gap-2.5 px-2 py-1.5 pl-3 text-[13px] font-medium"}
      >
        {compact ? (
          <CreateMark className="h-10 w-10 transition-transform duration-[var(--t-fast)] ease-decode group-hover:-translate-y-px" iconSize={13} />
        ) : (
          <span aria-hidden className="icon-island ml-auto h-7 w-7 transition-transform duration-[var(--t-fast)] ease-decode group-hover:translate-x-0.5">
            <Plus size={13} strokeWidth={1.8} />
          </span>
        )}
        <span className={compact ? "leading-none" : "order-first"}>{compact ? "Create" : "New decode"}</span>
      </button>

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {ITEMS.map(({ id, label, icon: Icon, target }) => {
          const on = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => openDashboardSection(target)}
                aria-current={on ? "page" : undefined}
                className={[
                  compact
                    ? "flex w-full flex-col items-center gap-1.5 rounded-[12px] px-1 py-2 text-center text-[10px] font-medium transition-[background-color,color,transform] duration-[var(--t-fast)] ease-decode"
                    : "flex w-full items-center gap-2.5 rounded-full px-2.5 py-2 text-left text-[13px] transition-[background-color,box-shadow,transform] duration-[var(--t-fast)] ease-decode",
                  compact
                    ? on
                      ? "bg-sky-wash text-sky-deep shadow-nav ring-1 ring-inset ring-sky-line"
                      : "text-t6 hover:-translate-y-px hover:bg-white/60 hover:text-ink"
                    : on
                      ? "bg-sky-wash font-medium text-sky-deep shadow-nav"
                      : "text-ink-2 hover:translate-x-0.5 hover:bg-white/60",
                ].join(" ")}
              >
                {compact ? (
                  <span className={on ? "grid h-8 w-8 place-items-center rounded-[9px] bg-sky text-white shadow-xs" : "grid h-8 w-8 place-items-center rounded-[9px] text-t6"}>
                    <Icon size={18} strokeWidth={1.8} aria-hidden />
                  </span>
                ) : (
                  <Icon size={15} strokeWidth={1.7} aria-hidden className={on ? "flex-none text-sky-deep" : "flex-none text-t6"} />
                )}
                <span className="min-w-0 truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
