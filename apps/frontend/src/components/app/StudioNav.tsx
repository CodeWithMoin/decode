"use client";

import { Compass, LayoutGrid, Plus, Shapes } from "lucide-react";
import { useStudio } from "@/store/studio";
import { useRouter } from "next/navigation";

export type StudioNavId = "home" | "recent" | "templates" | "none";

const ITEMS = [
  { id: "home", label: "Home", icon: Compass, target: null },
  { id: "recent", label: "Recent decodes", icon: LayoutGrid, target: "recent" },
  { id: "templates", label: "Templates", icon: Shapes, target: "templates" },
] as const;

/** Stable global navigation used both outside and inside a project. */
export function StudioNav({ active = "none", connected = false }: { active?: StudioNavId; connected?: boolean }) {
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
        className="glass-graphite group mb-5 flex min-h-10 w-full items-center gap-2.5 px-2 py-1.5 pl-3 text-[13px] font-medium"
      >
        <span
          aria-hidden
          className="icon-island ml-auto h-7 w-7 transition-transform duration-[var(--t-fast)] ease-decode group-hover:translate-x-0.5"
        >
          <Plus size={13} strokeWidth={1.8} />
        </span>
        <span className="order-first">New decode</span>
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
                  "flex w-full items-center gap-2.5 rounded-full px-2.5 py-2 text-left text-[13px] transition-[background-color,box-shadow,transform] duration-[var(--t-fast)] ease-decode",
                  on
                    ? "bg-white font-medium shadow-nav"
                    : "text-ink-2 hover:translate-x-0.5 hover:bg-white/60",
                ].join(" ")}
              >
                <Icon size={15} strokeWidth={1.7} aria-hidden className="flex-none text-t6" />
                <span className="min-w-0 truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
