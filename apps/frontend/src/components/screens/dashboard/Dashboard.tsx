"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projectCards, SEED_SCENES, TEMPLATES } from "@/lib/api";
import { fmt, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import { AppShell } from "@/components/app/AppShell";
import type { ProjectCard } from "@/lib/types";
import { decodeApi } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type { ProjectSummary, StudioSnapshot } from "@/lib/types";

const PROJECT_STAGES = [
  "Understanding",
  "Teaching Plan",
  "Script",
  "Edit",
  "Export",
] as const;

/**
 * Dashboard — the studio's front door.
 *
 * Every number here is derived from the project list rather than typed in:
 * the decode count is `cards.length`, and the total runtime is the sum of
 * each card's own `m:ss` figure. Nothing on this screen is hardcoded content
 * beyond what `lib/api.ts` already seeds.
 */
export function Dashboard({ connected = false }: { connected?: boolean }) {
  const router = useRouter();
  const go = useStudio((s) => s.go);
  const newDecode = useStudio((s) => s.newDecode);

  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, StudioSnapshot>>({});
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(connected);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the field the badge advertises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    decodeApi.listProjects()
      .then(async (result) => {
        if (!active) return;
        setProjects(result.items);
        const settled = await Promise.allSettled(
          result.items.map((project) => decodeApi.getStudio(project.project_id)),
        );
        if (!active) return;
        setSnapshots(Object.fromEntries(settled.flatMap((entry) => entry.status === "fulfilled" ? [[entry.value.project.project_id, entry.value] as const] : [])));
      })
      .catch((error: unknown) => {
        if (active) setLoadError(creatorError(error, "We couldn’t load your projects. Please try again."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [connected]);

  const scenes = useMemo(() => SEED_SCENES(), []);
  const seedCards = useMemo(() => {
    const meta = `${scenes.length} scenes · ${fmt(total(scenes))} · 2h ago`;
    return projectCards(meta);
  }, [scenes]);
  const cards = useMemo(() => connected ? projects.map((project) => projectToCard(project, snapshots[project.project_id])) : seedCards, [connected, projects, seedCards, snapshots]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.meta.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
    );
  }, [cards, query]);

  const runtimeSeconds = useMemo(
    () =>
      cards.reduce((sum, c) => {
        const match = c.meta.match(/(\d+):(\d{2})/);
        if (!match) return sum;
        return sum + Number(match[1]) * 60 + Number(match[2]);
      }, 0),
    [cards],
  );

  return (
    <AppShell active="home" connected={connected}>
      <main className="mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-8 sm:py-11">
        {/* The greeting is the loudest thing on the page again. Search sits
            beside it rather than in a bar of its own — one sticky glass header
            per screen is plenty, and the rail already anchors the app. */}
        <div className="mb-9 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[24px] font-semibold text-ink">
              Good morning, Mo
            </h1>
            <p className="mt-1 text-[13.5px] text-t7">
              {cards.length} decodes in your studio · {fmt(runtimeSeconds)} total
              runtime
            </p>
          </div>

          {/* A real field, not a decorative one. It previously rendered as a
              button with a ⌘K badge and did nothing — the same fake affordance
              we removed from the landing page's transport. Either it searches
              or it should not be here. */}
          <label className="relative hidden w-[240px] sm:block">
            <span className="sr-only">Search decodes</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search decodes…"
              className="min-h-9 w-full rounded-full border border-line-input bg-white pr-11 pl-4 text-[12.5px] text-ink outline-none transition-colors duration-[var(--t-fast)] placeholder:text-t7 hover:border-line-strong focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-tint)]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10.5px] text-t9"
            >
              ⌘K
            </span>
          </label>
        </div>

        {/* ------------------------- recent decodes ------------------------- */}
        <section id="recent" className="mb-11 scroll-mt-8">
          <h2 className="mb-4 text-xs font-medium tracking-[0.1em] text-t7 uppercase">
            Recent decodes
          </h2>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.65fr)]">
            {shown.length === 0 && (
              <p className="col-span-full m-0 rounded-[16px] border border-dashed border-line-input px-5 py-8 text-center text-[13px] text-t7">
                Nothing matches &ldquo;{query.trim()}&rdquo;.{" "}
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-accent-deep underline underline-offset-2"
                >
                  Clear the search
                </button>{" "}
                to see all {cards.length}.
              </p>
            )}
            {shown.length > 0 && (
              <FeaturedProject
                card={shown[0]}
                onOpen={() => openProject(shown[0], snapshots, connected, router.push, () => go("project"))}
              />
            )}
            {shown.length > 1 && (
              <div className="flex flex-col gap-3">
                {shown.slice(1).map((card) => (
                  <CompactProject
                    key={card.id}
                    card={card}
                    onOpen={() => openProject(card, snapshots, connected, router.push, () => go("project"))}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------------------------- templates ---------------------------- */}
        <section id="templates" className="scroll-mt-8">
          <h2 className="mb-4 text-xs font-medium tracking-[0.1em] text-t7 uppercase">
            Templates
          </h2>
          <div className="grid overflow-hidden rounded-[18px] border border-line bg-card md:grid-cols-2">
            {TEMPLATES.map((tpl, index) => (
              <button
                key={tpl.title}
                type="button"
                onClick={() => {
                  newDecode();
                  if (connected) router.push("/studio/new");
                }}
                className="group flex items-start gap-4 border-b border-line-div p-4 text-left transition-colors duration-[var(--t-fast)] hover:bg-sunken md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
              >
                <span
                  className="flex w-7 flex-none items-center justify-between font-mono text-[10px] text-t9"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-ink">
                    {tpl.title}
                  </span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-t7">
                    {tpl.desc}
                  </span>
                </span>
                <span className="flex-none text-[15px] text-t9 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5 group-hover:text-accent-deep">
                  →
                </span>
              </button>
            ))}
          </div>
        </section>
        {loading && <p className="text-[13px] text-t7">Loading projects…</p>}
        {loadError && <p role="alert" className="rounded-xl border border-[#E7C8BF] bg-[#FFF5F2] p-4 text-[13px] text-[#8E2F19]">{loadError}</p>}
      </main>

    </AppShell>
  );
}

function projectToCard(project: ProjectSummary, snapshot?: StudioSnapshot): ProjectCard {
  const currentStage = snapshot?.current_stage ?? project.current_stage;
  const jobStatus = snapshot?.most_recent_job?.status;
  const stage = "Understanding";
  const when = new Date(project.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return {
    id: project.project_id,
    title: project.title || "Untitled decode",
    meta: `${project.source_count ?? 0} source${project.source_count === 1 ? "" : "s"} · updated ${when}`,
    status: jobStatus === "failed" ? "Needs attention" : currentStage === "processing" ? "Processing" : currentStage === "draft" ? "Draft" : "Brief review",
    pillBg: "#F1F1EE",
    pillFg: project.status === "failed" ? "#8E2F19" : "#C2410C",
    sourceKind: "Sources",
    currentStage: stage,
    nextAction: currentStage === "processing" ? "Follow production progress" : currentStage === "draft" ? "Finish setting the direction" : "Review the production brief",
    progress: currentStage === "processing" ? 0.08 : currentStage === "draft" ? 0.02 : 0.2,
  };
}

function openProject(
  card: ProjectCard,
  snapshots: Record<string, StudioSnapshot>,
  connected: boolean,
  push: (href: string) => void,
  openPrototype: () => void,
) {
  if (!connected) return openPrototype();
  const snapshot = snapshots[card.id];
  const job = snapshot?.active_job ?? snapshot?.most_recent_job;
  if (snapshot?.current_stage === "processing" && job?.job_id) {
    push(`/studio/projects/${card.id}/jobs/${job.job_id}`);
  } else if (snapshot?.current_stage === "draft") {
    push("/studio/new");
  } else {
    push(`/studio/projects/${card.id}/understanding`);
  }
}

function FeaturedProject({
  card,
  onOpen,
}: {
  card: ProjectCard;
  onOpen: () => void;
}) {
  const activeStage = PROJECT_STAGES.findIndex(
    (stage) => stage === card.currentStage,
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid min-h-[294px] overflow-hidden rounded-[22px] border border-line bg-card text-left shadow-sm transition-[transform,box-shadow] duration-[var(--t-fast)] ease-decode hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[minmax(0,1.08fr)_minmax(230px,0.92fr)]"
    >
      <div className="relative flex min-h-[252px] flex-col border-b border-line-div bg-sunken-2 p-5 md:min-h-[294px] md:border-r md:border-b-0 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] tracking-[0.14em] text-t8 uppercase">
            Project · {card.sourceKind}
          </span>
          <span className="font-mono text-[9px] text-t9 tabular-nums">
            {Math.round(card.progress * 100)}%
          </span>
        </div>

        <div className="mt-6 flex flex-1 flex-col justify-center">
          {PROJECT_STAGES.map((stage, index) => {
            const done = index < activeStage;
            const active = index === activeStage;
            return (
              <div key={stage} className="group/stage relative flex min-h-8 items-center gap-3">
                {index < PROJECT_STAGES.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-5 left-[5px] h-[20px] w-px"
                    style={{
                      background: done
                        ? "var(--accent)"
                        : "var(--color-line-strong)",
                    }}
                  />
                )}
                <span
                  aria-hidden
                  className="relative z-[1] h-[11px] w-[11px] flex-none rounded-full border-2 bg-sunken-2"
                  style={{
                    borderColor:
                      done || active
                        ? "var(--accent)"
                        : "var(--color-line-strong)",
                    background: done ? "var(--accent)" : "var(--color-sunken-2)",
                  }}
                />
                <span
                  className={[
                    "text-[12px]",
                    active
                      ? "font-medium text-ink"
                      : done
                        ? "text-t6"
                        : "text-t9",
                  ].join(" ")}
                >
                  {stage}
                </span>
                {active && (
                  <span className="ml-auto font-mono text-[8.5px] tracking-[0.1em] text-accent-deep uppercase">
                    Current
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 h-1 overflow-hidden rounded-full bg-line-soft">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${card.progress * 100}%` }}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col p-5 md:p-6">
        <span className="font-mono text-[9.5px] tracking-[0.12em] text-accent-deep uppercase">
          Active production
        </span>
        <h3 className="mt-2 text-balance font-display text-[21px] font-semibold leading-[1.16] text-ink">
          {card.title}
        </h3>
        <p className="mt-2 text-[12.5px] leading-[1.55] text-t7">
          {card.nextAction}. Your sources, decisions, drafts, and crew notes
          stay together here.
        </p>
        <div className="mt-auto pt-5">
          <div className="font-mono text-[10px] text-t8">{card.meta}</div>
          <div className="mt-3 flex items-center justify-between border-t border-line-div pt-3">
            <span
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
              style={{ color: card.pillFg }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {card.status}
            </span>
            <span className="text-[12px] font-medium text-ink-2 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5">
              Continue →
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function CompactProject({
  card,
  onOpen,
}: {
  card: ProjectCard;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[141px] overflow-hidden rounded-[18px] border border-line bg-card text-left transition-[border-color,transform] duration-[var(--t-fast)] hover:-translate-y-px hover:border-line-strong"
    >
      <span className="flex w-[92px] flex-none flex-col justify-between border-r border-line-div bg-sunken-2 p-3">
        <span className="font-mono text-[8px] tracking-[0.1em] text-t8 uppercase">
          {card.sourceKind}
        </span>
        <span className="font-display text-[19px] font-semibold text-ink/35">
          {card.id.slice(0, 2).toUpperCase()}
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-line-soft">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${card.progress * 100}%` }}
          />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col p-4">
        <span className="line-clamp-2 font-display text-[14px] font-semibold leading-[1.25] text-ink">
          {card.title}
        </span>
        <span className="mt-1 truncate text-[11px] text-t7">{card.meta}</span>
        <span className="mt-auto flex items-center justify-between pt-3 text-[11px]">
          <span style={{ color: card.pillFg }}>{card.currentStage}</span>
          <span className="text-t9 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5">→</span>
        </span>
      </span>
    </button>
  );
}
