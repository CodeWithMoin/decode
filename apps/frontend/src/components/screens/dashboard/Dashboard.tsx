"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Plus, RotateCw, Search, Trash2, TriangleAlert } from "lucide-react";
import { projectCards, SEED_SCENES, TEMPLATES } from "@/lib/api";
import { fmt, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import { AppShell } from "@/components/app/AppShell";
import { STAGES } from "@/lib/stages";
import type { ProjectCard } from "@/lib/types";
import { decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type { ProjectSummary, StudioSnapshot } from "@/lib/types";
import { CreateMark, Graphite } from "@/components/ui/primitives";

const DECODE_EASE = [0.22, 1, 0.36, 1] as const;

type ProjectFilter = "all" | "attention" | "working";
type ProjectSort = "updated" | "title";
type AttentionKind = "failed" | "review" | "setup" | null;

type DashboardCard = ProjectCard & {
  attention: AttentionKind;
  attentionDetail: string;
  updatedAt: number;
  working: boolean;
};

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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [sort, setSort] = useState<ProjectSort>("updated");
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
    setLoading(true);
    setLoadError("");
    decodeApi.listProjects()
      .then(async (result) => {
        if (!active) return;
        setProjects(result.items);
        const settled = await Promise.allSettled(
          result.items.map((project) => decodeApi.getStudio(project.project_id)),
        );
        if (!active) return;
        const loadedSnapshots = Object.fromEntries(
          settled.flatMap((entry) =>
            entry.status === "fulfilled"
              ? [[entry.value.project.project_id, entry.value] as const]
              : [],
          ),
        );
        setSnapshots(loadedSnapshots);
        if (settled.some((entry) => entry.status === "rejected")) {
          setLoadError("Some project details could not be refreshed. The projects we could read are shown below.");
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(creatorError(error, "We couldn’t load your projects. Please try again."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [connected, loadAttempt]);

  const scenes = useMemo(() => SEED_SCENES(), []);
  const seedCards = useMemo(() => {
    const meta = `${scenes.length} scenes · ${fmt(total(scenes))} · 2h ago`;
    return projectCards(meta);
  }, [scenes]);
  const cards = useMemo<DashboardCard[]>(
    () =>
      connected
        ? projects.map((project) => projectToCard(project, snapshots[project.project_id]))
        : seedCards.map(decorateSeedCard),
    [connected, projects, seedCards, snapshots],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter((card) => {
        if (filter === "attention" && !card.attention) return false;
        if (filter === "working" && !card.working) return false;
        if (!q) return true;
        return [card.title, card.meta, card.status, card.currentStage, card.nextAction]
          .some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : b.updatedAt - a.updatedAt,
      );
  }, [cards, filter, query, sort]);

  const attentionCards = useMemo(
    () => cards.filter((card) => card.attention).sort((a, b) => attentionRank(a) - attentionRank(b) || b.updatedAt - a.updatedAt),
    [cards],
  );
  const workingCount = cards.filter((card) => card.working).length;
  const firstRun = connected && !loading && !loadError && cards.length === 0;

  const beginDecode = () => {
    newDecode();
    if (connected) router.push("/studio/new");
  };

  const browseTemplates = () => {
    document.getElementById("templates")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Drop it from the list first: the card is already gone from the creator's
  // intent, and waiting on the round trip leaves them clicking a dead tile. A
  // failure puts it back and says why.
  const removeProject = async (projectId: string) => {
    const previous = projects;
    setProjects((items) => items.filter((item) => item.project_id !== projectId));
    try {
      await decodeApi.deleteProject(projectId, idempotencyKey());
    } catch (error: unknown) {
      setProjects(previous);
      setLoadError(creatorError(error, "We couldn’t remove that decode. It’s still here."));
    }
  };

  return (
    <AppShell active="home" connected={connected}>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        {firstRun ? (
          <>
            <FirstRunStudio onStart={beginDecode} onBrowseTemplates={browseTemplates} />
            <TemplateShelf onStart={beginDecode} />
          </>
        ) : (
          <>
          <section className="studio-shell mb-10">
            <div className="home-creation-deck studio-surface overflow-hidden px-5 py-9 text-center sm:px-8 sm:py-11 lg:px-12 lg:py-12">
              <span className="studio-eyebrow">Decode studio</span>
              <h1 className="mx-auto mt-5 max-w-[1080px] font-display text-[clamp(36px,4.7vw,58px)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink lg:whitespace-nowrap">
                What should the crew teach next?
              </h1>
              <p className="mx-auto mt-4 max-w-[820px] text-[14px] leading-[1.65] text-t6 sm:text-[15px] lg:whitespace-nowrap">
                Start with a paper, technical document, slides, or notes. You direct every production decision.
              </p>

              <button
                type="button"
                onClick={beginDecode}
                className="group mx-auto mt-7 flex min-h-[72px] w-full max-w-[760px] items-center gap-4 rounded-[18px] border border-[var(--accent-line)] bg-white p-3 text-left shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:border-[var(--accent-ring)] hover:bg-accent-card hover:shadow-lg active:translate-y-0 active:scale-[0.995]"
              >
                <CreateMark className="h-11 w-11 transition-transform duration-[var(--t-fast)] ease-decode group-hover:scale-[1.03] group-active:scale-[0.97]" iconSize={18} shape="square" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-semibold text-ink">Start a new decode</span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-t6">Upload a source, then set the audience, depth, voice, and runtime.</span>
                </span>
                <span className="hidden flex-none items-center gap-2 rounded-full bg-ink px-3 py-2 text-[11.5px] font-medium text-white transition-transform duration-[var(--t-fast)] ease-decode group-hover:translate-x-0.5 sm:flex">
                  New production
                  <ArrowRight size={13} strokeWidth={1.8} className="transition-transform duration-[var(--t-fast)] ease-decode group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>

              <div className="mx-auto mt-5 flex max-w-[760px] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11.5px] text-t6">
                <button type="button" onClick={browseTemplates} className="font-medium text-accent-deep underline decoration-[var(--accent-line)] underline-offset-4">Browse templates</button>
                <span aria-hidden className="hidden h-3 w-px bg-line-mid sm:block" />
                {loading ? (
                  <span>Reading your studio…</span>
                ) : (
                  <span>{cards.length} project{cards.length === 1 ? "" : "s"} · {workingCount} working · {attentionCards.length} need{attentionCards.length === 1 ? "s" : ""} your attention</span>
                )}
              </div>
            </div>
          </section>

          <TemplateShelf onStart={beginDecode} />

          {loadError && (
            <LoadFailure message={loadError} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
          )}

          {loading ? (
            <DashboardSkeleton />
          ) : (
            <>
            {attentionCards.length > 0 && !query && filter === "all" && (
              <section className="mb-12">
                <SectionHeading eyebrow="Next decisions" title="Needs your attention" detail="Review, recover, or finish setup without hunting through the studio." />
                <div className="grid gap-3">
                  {attentionCards.slice(0, 3).map((card) => (
                    <AttentionRow
                      key={card.id}
                      card={card}
                      onOpen={() => openProject(card, snapshots, connected, router.push, () => go("project"))}
                    />
                  ))}
                </div>
              </section>
            )}

        <section id="recent" className="mb-14 scroll-mt-8">
          <div className="mb-5 px-1">
            <SectionHeading eyebrow="Your work" title="Recent decodes" detail="Resume at the exact production step where you left off." />
            <div className="mt-4 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <SearchField searchRef={searchRef} query={query} onChange={setQuery} />
              {cards.length >= 6 && <ProjectControls filter={filter} sort={sort} onFilter={setFilter} onSort={setSort} />}
            </div>
          </div>
          {/* One card per project, all the same size. The old layout gave the
              first project a 294px hero panel with a vertical stage rail and
              listed the rest small beside it — which made the newest decode look
              important rather than the one that needs you, and left most of the
              hero empty. Uniform tiles also mean adding a sixth project changes
              nothing about the fifth. */}
          <motion.div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}
          >
            {/* Two different empties. A studio with no decodes in it is a first
                run and wants an invitation; a search with no hits is a dead end
                and wants a way out. Sending the first case through the second
                greeted new creators with: Nothing matches "". */}
            {cards.length > 0 && shown.length === 0 && (
              <SearchEmpty
                query={query}
                filtered={filter !== "all"}
                onReset={() => { setQuery(""); setFilter("all"); }}
              />
            )}
            <AnimatePresence mode="popLayout">
            {shown.map((card) => (
              <ProjectTile
                key={card.id}
                card={card}
                onOpen={() => openProject(card, snapshots, connected, router.push, () => go("project"))}
                onDelete={connected ? () => void removeProject(card.id) : undefined}
              />
            ))}
            </AnimatePresence>
          </motion.div>
        </section>
            </>
          )}
          </>
        )}

      </main>

    </AppShell>
  );
}

function SearchField({
  searchRef,
  query,
  onChange,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block w-full max-w-[380px]">
      <span className="sr-only">Search decodes</span>
      <Search aria-hidden size={14} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-t8" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search decodes…"
        className="min-h-11 w-full rounded-full border border-line-input bg-sunken pr-14 pl-10 text-[13px] text-ink outline-none transition-[background-color,border-color,box-shadow] duration-[var(--t-fast)] ease-decode placeholder:text-t7 hover:border-line-strong hover:bg-white focus:border-sky focus:bg-white focus:shadow-[0_0_0_3px_var(--sky-tint)]"
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-white px-2 py-1 font-mono text-[9px] text-t8 shadow-xs">
        ⌘K
      </span>
    </label>
  );
}

function TemplateShelf({ onStart }: { onStart: () => void }) {
  return (
    <section id="templates" className="mb-12 scroll-mt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.035em] text-ink">Start from a format</h2>
          <p className="mt-1 text-[13px] text-t6">Use a proven teaching shape, then direct it around your source.</p>
        </div>
        <span className="font-mono text-[9px] tracking-[0.1em] text-t6 uppercase">{TEMPLATES.length} quick starts</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
        {TEMPLATES.map((template, index) => (
          <button
            key={template.title}
            type="button"
            onClick={onStart}
            className="studio-shell group min-w-0 text-left transition-transform duration-[var(--t-fast)] ease-decode hover:-translate-y-px"
          >
            <span className="studio-surface block h-full overflow-hidden transition-shadow duration-[var(--t-fast)] group-hover:shadow-md">
              <span className="scene-surface relative block h-[112px] overflow-hidden rounded-t-[18px]">
                <span className="absolute top-3 left-3 font-mono text-[8px] tracking-[0.12em] text-canvas-meta uppercase">Format {String(index + 1).padStart(2, "0")}</span>
                <span className="absolute right-4 bottom-2 font-display text-[54px] leading-none text-accent-lit opacity-90" aria-hidden>{template.glyph}</span>
                <span className="absolute bottom-4 left-3 grid w-[54%] gap-1.5" aria-hidden>
                  <span className="h-1.5 w-full rounded-full bg-canvas-line" />
                  <span className="h-1.5 w-[78%] rounded-full bg-canvas-line" />
                  <span className="h-1.5 w-[48%] rounded-full bg-accent-lit" />
                </span>
              </span>
              <span className="flex items-start gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[13.5px] font-semibold text-ink">{template.title}</span>
                  <span className="mt-1 block text-[11.5px] leading-[1.5] text-t6">{template.desc}</span>
                </span>
                <ArrowRight size={14} strokeWidth={1.8} className="mt-0.5 flex-none text-t8 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5 group-hover:text-accent-deep" aria-hidden />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FirstRunStudio({ onStart, onBrowseTemplates }: { onStart: () => void; onBrowseTemplates: () => void }) {
  const steps = [
    ["Bring the source", "Add a paper, technical spec, documentation, or slides."],
    ["Set the direction", "Choose the audience, depth, voice, and target runtime."],
    ["Direct the production", "Review each handoff, then shape the scenes and final cut."],
  ];
  return (
    <section className="studio-shell mb-14">
      <div className="home-creation-deck studio-surface overflow-hidden p-6 sm:p-8 lg:p-12">
        <div className="mx-auto max-w-[760px] text-center">
          <span className="studio-eyebrow">Your first production</span>
          <h1 className="mt-6 font-display text-[clamp(36px,6vw,68px)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">
            Turn technical material into something people can understand.
          </h1>
          <p className="mx-auto mt-5 max-w-[58ch] text-[14px] leading-[1.7] text-t6 sm:text-[15px]">
            Start with the source. Decode prepares the teaching structure, script, visuals, and edit while you direct every important decision.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Graphite type="button" onClick={onStart} className="inline-flex min-h-11 items-center gap-2 px-4 text-[13px] font-medium">
              <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-white/15" aria-hidden><Plus size={13} strokeWidth={2.25} /></span>
              Start your first decode
            </Graphite>
            <button type="button" onClick={onBrowseTemplates} className="min-h-11 rounded-full border border-line-input bg-sunken px-4 text-[13px] font-medium text-ink-2 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:bg-white">
              Browse templates
            </button>
          </div>
        </div>
        <div className="mx-auto mt-12 grid max-w-[900px] gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          {steps.map(([title, detail], index) => (
            <div key={title} className="studio-surface-muted p-5 text-left">
              <span className="font-mono text-[9px] tracking-[0.14em] text-t8 uppercase">Step {String(index + 1).padStart(2, "0")}</span>
              <h2 className="mt-3 font-display text-[15px] font-semibold text-ink">{title}</h2>
              <p className="mt-1.5 text-[12.5px] leading-[1.6] text-t6">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="studio-shell mb-10">
      <div className="studio-surface flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-sunken-3 text-accent-deep" aria-hidden>
          <TriangleAlert size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-[220px] flex-1">
          <p className="text-[13px] font-medium text-ink">The studio did not fully refresh</p>
          <p className="mt-0.5 text-[12px] leading-[1.55] text-t6">{message}</p>
        </div>
        <button type="button" onClick={onRetry} className="flex min-h-9 items-center gap-2 rounded-full border border-line-input bg-sunken px-3 text-[12px] font-medium text-ink-2 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:bg-white">
          <RotateCw size={13} strokeWidth={1.8} aria-hidden /> Retry
        </button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <section id="recent" className="mb-14 scroll-mt-8" aria-live="polite" aria-busy="true">
      <SectionHeading eyebrow="Your work" title="Recent decodes" detail="Resume at the exact production step where you left off." />
      <span className="sr-only">Loading projects, current stages, and next actions.</span>
      <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="studio-shell min-h-[330px]">
            <div className="studio-surface flex h-full flex-col p-5">
              <span className="scene-surface mb-4 block h-[92px] rounded-[14px]" />
              <span className="h-2.5 w-20 rounded-full bg-sunken-3" />
              <span className="mt-3 h-4 w-3/4 rounded-full bg-sunken-3" />
              <span className="mt-2 h-3 w-1/2 rounded-full bg-sunken-3" />
              <div className="mt-auto pt-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="h-3 w-20 rounded-full bg-sunken-3" />
                  <span className="h-2.5 w-8 rounded-full bg-sunken-3" />
                </div>
                <span className="mt-2 block h-[3px] w-full rounded-full bg-sunken-3" />
                <span className="mt-4 block h-3 w-2/3 rounded-full bg-sunken-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div>
      <span className="studio-eyebrow">{eyebrow}</span>
      <h2 className="mt-3 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.035em] text-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-t6">{detail}</p>
    </div>
  );
}

function ProjectControls({
  filter,
  sort,
  onFilter,
  onSort,
}: {
  filter: ProjectFilter;
  sort: ProjectSort;
  onFilter: (filter: ProjectFilter) => void;
  onSort: (sort: ProjectSort) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-none">
      <div className="flex rounded-full border border-line-input bg-sunken p-1" aria-label="Filter projects">
        {(["all", "attention", "working"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-[var(--t-fast)] ${filter === value ? "bg-sky-wash text-sky-deep shadow-xs" : "text-t6 hover:text-ink"}`}
          >
            {value === "all" ? "All" : value === "attention" ? "Needs you" : "Working"}
          </button>
        ))}
      </div>
      <label>
        <span className="sr-only">Sort projects</span>
        <select value={sort} onChange={(event) => onSort(event.target.value as ProjectSort)} className="min-h-9 rounded-full border border-line-input bg-sunken px-3 text-[11px] font-medium text-ink-2">
          <option value="updated">Recently updated</option>
          <option value="title">Project name</option>
        </select>
      </label>
    </div>
  );
}

function AttentionRow({ card, onOpen }: { card: DashboardCard; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="studio-shell group w-full text-left">
      <span className="studio-surface flex items-center gap-4 bg-accent-card p-4 transition-shadow duration-[var(--t-fast)] group-hover:shadow-md sm:p-5">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-card font-mono text-[9px] font-semibold tracking-[0.08em] text-accent-deep uppercase">
          {card.attention === "failed" ? "Fix" : card.attention === "setup" ? "Set" : "Read"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[14px] font-semibold text-ink">{card.title}</span>
          <span className="mt-0.5 block text-[12px] leading-[1.5] text-t6">{card.attentionDetail}</span>
          <span className="mt-1 block font-mono text-[9px] tracking-[0.08em] text-t6 uppercase">{card.meta}</span>
        </span>
        <span className="hidden flex-none text-right sm:block">
          <span className="block font-mono text-[9px] tracking-[0.1em] text-t8 uppercase">{card.currentStage}</span>
          <span className="mt-1 block text-[11.5px] font-medium text-accent-deep">{card.nextAction}</span>
        </span>
        <ArrowRight size={15} strokeWidth={1.8} className="flex-none text-t8 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5 group-hover:text-accent-deep" aria-hidden />
      </span>
    </button>
  );
}

function SearchEmpty({ query, filtered, onReset }: { query: string; filtered: boolean; onReset: () => void }) {
  const detail = query.trim()
    ? `Nothing matches “${query.trim()}” in the current view.`
    : filtered
      ? "No projects match this filter right now."
      : "No projects are available.";
  return (
    <div className="studio-shell col-span-full m-0">
      <div className="studio-surface px-5 py-10 text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-sunken-3 text-t7" aria-hidden><Search size={16} strokeWidth={1.8} /></span>
        <p className="mt-3 text-[13px] font-medium text-ink">No decodes found</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] text-t6">{detail}</p>
        <button type="button" onClick={onReset} className="mt-4 min-h-9 rounded-full border border-line-input bg-sunken px-3 text-[12px] font-medium text-ink-2 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:bg-white">
          Show all projects
        </button>
      </div>
    </div>
  );
}

/**
 * What the backend can honestly say about a project today.
 *
 * `current_stage` has exactly three values, because Understanding is the only
 * connected stage: a project is either still being set up, has a brief in
 * flight, or has one to read. Labelling all three "Understanding" told the
 * creator a draft with no sources had reached a stage it never started.
 *
 * `reached` is how many of the four stages actually have work behind them, so
 * the progress bar reports something. The old 0.08 / 0.02 / 0.2 were three
 * constants chosen to look like movement.
 */
const STAGE_VIEW: Record<string, { label: string; reached: number; status: string; next: string }> = {
  draft: { label: "Not started", reached: 0, status: "Draft", next: "Finish setting the direction" },
  processing: { label: "Understanding", reached: 0, status: "Working", next: "Follow production progress" },
  understanding: { label: "Understanding", reached: 1, status: "Brief review", next: "Review the production brief" },
  teaching_plan: { label: "Teaching Plan", reached: 2, status: "Plan review", next: "Review the Teaching Plan" },
};

function projectToCard(project: ProjectSummary, snapshot?: StudioSnapshot): DashboardCard {
  const currentStage = snapshot?.current_stage ?? project.current_stage;
  const jobStatus = snapshot?.most_recent_job?.status;
  const failed = jobStatus === "failed" || project.status === "failed";
  const working = jobStatus === "queued" || jobStatus === "running" || currentStage === "processing";
  const planning = working && snapshot?.most_recent_job?.kind === "generate_teaching_plan";
  const brief = snapshot?.artifacts.find((artifact) => artifact.artifact_type === "production_brief");
  const plan = snapshot?.artifacts.find((artifact) => artifact.artifact_type === "teaching_plan");
  const awaitingBriefReview = currentStage === "understanding" && brief?.latest_version_id !== brief?.approved_version_id;
  const awaitingPlanReview = currentStage === "teaching_plan" && plan?.latest_version_id !== plan?.approved_version_id;
  const needsSetup = currentStage === "draft" || !currentStage;
  const view = planning
    ? { label: "Teaching Plan", reached: 1, status: "Working", next: "Follow the Director’s progress" }
    : STAGE_VIEW[currentStage ?? "draft"] ?? STAGE_VIEW.draft;
  const when = new Date(project.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const attention: AttentionKind = failed ? "failed" : awaitingBriefReview || awaitingPlanReview ? "review" : needsSetup ? "setup" : null;
  return {
    id: project.project_id,
    title: project.title || "Untitled decode",
    meta: `${project.source_count ?? 0} source${project.source_count === 1 ? "" : "s"} · updated ${when}`,
    status: failed ? "Needs attention" : awaitingBriefReview ? "Brief review" : awaitingPlanReview ? "Plan review" : needsSetup ? "Setup needed" : working ? "Working" : "Approved",
    pillBg: "#F1F1EE",
    pillFg: failed ? "#8E2F19" : "#C2410C",
    sourceKind: "Sources",
    currentStage: view.label,
    // A failed run is not progress to follow; it is a thing to look at.
    nextAction: failed ? "See what went wrong" : awaitingBriefReview ? "Review the production brief" : awaitingPlanReview ? "Review the Teaching Plan" : view.next,
    progress: view.reached / STAGES.length,
    attention,
    attentionDetail: failed
      ? "The latest production run stopped and needs a recovery decision."
      : awaitingBriefReview
        ? "The production brief is ready for your review before the crew continues."
        : awaitingPlanReview
          ? "The Director’s Teaching Plan is ready for your review before writing begins."
        : needsSetup
          ? "Finish the source and direction so the crew can begin production."
          : "",
    updatedAt: Date.parse(project.updated_at) || 0,
    working,
  };
}

function decorateSeedCard(card: ProjectCard, index: number): DashboardCard {
  const working = card.status.toLowerCase().includes("rendering");
  const review = card.status.toLowerCase().includes("review") || card.nextAction.toLowerCase().includes("review");
  return {
    ...card,
    attention: review ? "review" : null,
    attentionDetail: review ? `${card.nextAction}. The crew is waiting for your decision.` : "",
    updatedAt: Date.now() - index * 86_400_000,
    working,
  };
}

function attentionRank(card: DashboardCard) {
  if (card.attention === "failed") return 0;
  if (card.attention === "review") return 1;
  return 2;
}

function ProjectPreview({ card }: { card: DashboardCard }) {
  const reached = Math.max(1, Math.round(card.progress * STAGES.length));
  return (
    <div className="scene-surface relative mb-4 h-[92px] overflow-hidden rounded-[14px] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[8px] tracking-[0.12em] text-canvas-meta uppercase">{card.sourceKind}</span>
        <span className="font-mono text-[8px] tracking-[0.1em] text-accent-lit uppercase">{card.currentStage}</span>
      </div>
      <div className="absolute right-3 bottom-3 left-3">
        <div className="mb-2 flex items-end justify-between gap-1.5" aria-hidden>
          {STAGES.map((stage, index) => (
            <span
              key={stage.tab}
              className={index < reached ? "h-7 flex-1 rounded-[5px] bg-accent-lit" : "h-7 flex-1 rounded-[5px] bg-canvas-line"}
              style={{ opacity: index < reached ? 0.9 - index * 0.08 : 1 }}
            />
          ))}
        </div>
        <div className="font-mono text-[8px] tracking-[0.08em] text-canvas-meta uppercase">Five-stage production</div>
      </div>
    </div>
  );
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
  } else if (snapshot?.current_stage === "teaching_plan") {
    push(`/studio/projects/${card.id}/teaching-plan`);
  } else {
    push(`/studio/projects/${card.id}/understanding`);
  }
}



/**
 * One project, one card.
 *
 * Delete is a two-step inline confirm rather than a modal or `window.confirm`:
 * the card already owns the space, and a creator who mis-clicks sees exactly
 * which project is about to go. Deleting is soft on the server, so this removes
 * it from the studio rather than destroying the drafts inside it.
 */
function ProjectTile({ card, onOpen, onDelete }: { card: DashboardCard; onOpen: () => void; onDelete?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const still = useReducedMotion();
  return (
    <motion.div
      layout
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: DECODE_EASE } }}
      whileHover={still ? undefined : { y: -1 }}
      whileTap={still ? undefined : { scale: 0.994 }}
      transition={{ duration: 0.15, ease: DECODE_EASE }}
      className="studio-shell group relative flex min-h-[330px] flex-col"
    >
      <button type="button" onClick={onOpen} className="studio-surface flex flex-1 flex-col p-5 text-left transition-shadow duration-[var(--t-fast)] ease-decode group-hover:shadow-md">
        <ProjectPreview card={card} />
        <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-t8 uppercase">
          {card.working && <WorkingDot />}
          {card.status}
        </span>
        <h3 className="mt-1.5 font-display text-[15px] leading-[1.35] font-semibold text-ink">{card.title}</h3>
        <p className="mt-1 text-[12px] text-t7">{card.meta}</p>

        <div className="mt-auto w-full pt-6">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] text-accent-deep">{card.currentStage}</span>
            <span className="font-mono text-[9px] text-t9 tabular-nums">{Math.round(card.progress * 100)}%</span>
          </div>
          <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-sunken-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(card.progress * 100, 1.5)}%` }} />
          </div>
          <p className="mt-3 text-[12px] font-medium text-ink-2">{card.nextAction} →</p>
        </div>
      </button>

      {/* Always rendered, never hover-revealed: a touch device has no hover, so
          an opacity-0 control is one nobody on a tablet can reach. It earns its
          quiet through colour instead. */}
      {onDelete && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${card.title}`}
          className="absolute top-4 right-4 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-t7 shadow-xs transition-[color,background-color] duration-[var(--t-fast)] ease-decode hover:bg-white hover:text-ink"
        >
          <Trash2 size={13} />
        </button>
      )}
      {confirming && (
        <div className="mx-1 mb-1 flex items-center justify-between gap-2 rounded-[14px] bg-sunken px-4 py-2.5">
          <span className="text-[11.5px] text-t6">Remove from your studio?</span>
          <span className="flex flex-none gap-1">
            <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-2.5 py-1 text-[11.5px] text-t6 hover:text-ink">Cancel</button>
            <button type="button" onClick={onDelete} className="rounded-full bg-ink px-2.5 py-1 text-[11.5px] text-white">Delete</button>
          </span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * The one perpetual animation on this screen.
 *
 * It renders only while a run is actually in flight, so the motion carries
 * information rather than decoration — a still dot means nothing is happening,
 * and that distinction is the whole point. Isolated as its own component so the
 * infinite loop never re-renders the grid around it.
 */
function WorkingDot() {
  const still = useReducedMotion();
  if (still) return <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-accent" />;
  return (
    <motion.span
      aria-hidden
      className="h-1.5 w-1.5 flex-none rounded-full bg-accent"
      animate={{ opacity: [1, 0.35, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: DECODE_EASE }}
    />
  );
}
