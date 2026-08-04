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
        className="mb-4 flex min-h-9 w-full items-center gap-2 rounded-[10px] border border-line-input bg-card px-2.5 text-[13px] font-medium transition-[background-color,border-color] duration-[var(--t-fast)] hover:border-line-strong hover:bg-white"
      >
        <span
          aria-hidden
          className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] bg-accent text-white"
        >
          <Plus size={12} strokeWidth={2.4} />
        </span>
        New decode
      </button>

      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {ITEMS.map(({ id, label, icon: Icon, target }) => {
          const on = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => openDashboardSection(target)}
                aria-current={on ? "page" : undefined}
                className={[
                  "flex w-full items-center gap-2.5 rounded-full px-2.5 py-2 text-left text-[13px] transition-[background-color,box-shadow] duration-[var(--t-fast)]",
                  on
                    ? "bg-white font-medium shadow-nav"
                    : "text-ink-2 hover:bg-white/55",
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
