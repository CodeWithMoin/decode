"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { projectCards, SEED_SCENES, TEMPLATES } from "@/lib/api";
import { fmt, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import { AppShell } from "@/components/app/AppShell";
import { STAGES } from "@/lib/stages";
import type { ProjectCard } from "@/lib/types";
import { decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type { ProjectSummary, StudioSnapshot } from "@/lib/types";
import { Graphite } from "@/components/ui/primitives";

const DECODE_EASE = [0.22, 1, 0.36, 1] as const;

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

  const beginDecode = () => {
    newDecode();
    if (connected) router.push("/studio/new");
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
        <section className="studio-shell mb-12">
          <div className="studio-surface grid gap-8 overflow-hidden p-6 sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] lg:p-10">
            <div className="min-w-0">
              <span className="studio-eyebrow">Studio overview</span>
              <h1 className="mt-5 max-w-[720px] font-display text-[clamp(34px,5vw,64px)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">
                Your productions, ready for the next decision.
              </h1>
              <p className="mt-5 max-w-[58ch] text-[14px] leading-[1.7] text-t6 sm:text-[15px]">
                Continue a decode, review what the crew prepared, or start from a proven teaching format.
              </p>
              <label className="relative mt-8 block w-full max-w-[440px]">
                <span className="sr-only">Search decodes</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search decodes…"
                  className="min-h-11 w-full rounded-full border border-line-input bg-sunken pr-14 pl-5 text-[13px] text-ink outline-none transition-[background-color,border-color,box-shadow] duration-[var(--t-fast)] ease-decode placeholder:text-t7 hover:border-line-strong hover:bg-white focus:border-[var(--accent)] focus:bg-white focus:shadow-[0_0_0_3px_var(--accent-tint)]"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-white px-2 py-1 font-mono text-[9px] text-t8 shadow-xs"
                >
                  ⌘K
                </span>
              </label>
            </div>
            <div className="studio-surface-muted grid content-between gap-8 p-5 sm:p-6">
              <div>
                <div className="font-mono text-[9px] tracking-[0.14em] text-t8 uppercase">Today in Decode</div>
                <div className="mt-3 font-serif text-[clamp(28px,3vw,42px)] leading-[1.02] text-ink">
                  Good morning, Mo.
                </div>
                <p className="mt-3 text-[12.5px] leading-[1.65] text-t6">
                  Your studio holds {fmt(runtimeSeconds)} of finished and in-progress teaching.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StudioMetric value={`${cards.length}`} label="Decodes" />
                <StudioMetric value={fmt(runtimeSeconds)} label="Runtime" />
                <StudioMetric value={`${cards.filter((card) => card.status !== "Working").length}`} label="Ready" />
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------- recent decodes ------------------------- */}
        <section id="recent" className="mb-14 scroll-mt-8">
          <div className="mb-5 flex items-end justify-between gap-4 px-1">
            <div>
              <span className="studio-eyebrow">Your work</span>
              <h2 className="mt-3 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.035em] text-ink">
                Recent decodes
              </h2>
              <p className="mt-1 text-[13px] text-t7">Pick up at the exact production decision that needs you.</p>
            </div>
            <span className="hidden font-mono text-[10px] text-t9 sm:block">
              {cards.length} in your studio
            </span>
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
            {cards.length === 0 && (
              <div className="studio-shell col-span-full m-0">
                <div className="studio-surface px-5 py-12 text-center">
                <p className="m-0 text-[14px] font-medium text-ink">Your studio is empty</p>
                <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] text-t7">
                  Bring a paper, a spec, or any technical document and Decode will turn it into a
                  lesson you direct, scene by scene.
                </p>
                <Graphite
                  type="button"
                  onClick={beginDecode}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 px-3.5 text-[13px] font-medium"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-white/15" aria-hidden>
                    <Plus size={13} strokeWidth={2.25} />
                  </span>
                  Start your first decode
                </Graphite>
                </div>
              </div>
            )}
            {cards.length > 0 && shown.length === 0 && (
              <p className="studio-surface col-span-full m-0 px-5 py-10 text-center text-[13px] text-t7">
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

        {/* ---------------------------- templates ---------------------------- */}
        <section id="templates" className="scroll-mt-8 pb-8">
          <div className="mb-5 px-1">
            <span className="studio-eyebrow">Proven starting points</span>
            <h2 className="mt-3 font-display text-[clamp(24px,3vw,34px)] font-semibold tracking-[-0.035em] text-ink">Templates</h2>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" }}>
            {TEMPLATES.map((tpl, index) => (
              <div key={tpl.title} className="studio-shell">
                <button
                  type="button"
                  onClick={() => {
                    newDecode();
                    if (connected) router.push("/studio/new");
                  }}
                  className="studio-surface group flex h-full w-full items-start gap-4 p-5 text-left transition-[transform,box-shadow] duration-[var(--t-fast)] ease-decode hover:-translate-y-px hover:shadow-md"
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
              </div>
            ))}
          </div>
        </section>
        {loading && <p className="studio-surface mt-4 p-4 text-[13px] text-t7">Reading your studio index and project stages…</p>}
        {loadError && <p role="alert" className="rounded-xl border border-[#E7C8BF] bg-[#FFF5F2] p-4 text-[13px] text-[#8E2F19]">{loadError}</p>}
      </main>

    </AppShell>
  );
}

function StudioMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[12px] bg-white px-3 py-3 shadow-xs">
      <div className="truncate font-display text-[16px] font-semibold text-ink">{value}</div>
      <div className="mt-0.5 font-mono text-[8px] tracking-[0.1em] text-t8 uppercase">{label}</div>
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
 * `reached` is how many of the five stages actually have work behind them, so
 * the progress bar reports something. The old 0.08 / 0.02 / 0.2 were three
 * constants chosen to look like movement.
 */
const STAGE_VIEW: Record<string, { label: string; reached: number; status: string; next: string }> = {
  draft: { label: "Not started", reached: 0, status: "Draft", next: "Finish setting the direction" },
  processing: { label: "Understanding", reached: 0, status: "Working", next: "Follow production progress" },
  understanding: { label: "Understanding", reached: 1, status: "Brief review", next: "Review the production brief" },
};

function projectToCard(project: ProjectSummary, snapshot?: StudioSnapshot): ProjectCard {
  const currentStage = snapshot?.current_stage ?? project.current_stage;
  const jobStatus = snapshot?.most_recent_job?.status;
  const failed = jobStatus === "failed";
  const view = STAGE_VIEW[currentStage ?? "draft"] ?? STAGE_VIEW.draft;
  const when = new Date(project.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return {
    id: project.project_id,
    title: project.title || "Untitled decode",
    meta: `${project.source_count ?? 0} source${project.source_count === 1 ? "" : "s"} · updated ${when}`,
    status: failed ? "Needs attention" : view.status,
    pillBg: "#F1F1EE",
    pillFg: project.status === "failed" ? "#8E2F19" : "#C2410C",
    sourceKind: "Sources",
    currentStage: view.label,
    // A failed run is not progress to follow; it is a thing to look at.
    nextAction: failed ? "See what went wrong" : view.next,
    progress: view.reached / STAGES.length,
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



/**
 * One project, one card.
 *
 * Delete is a two-step inline confirm rather than a modal or `window.confirm`:
 * the card already owns the space, and a creator who mis-clicks sees exactly
 * which project is about to go. Deleting is soft on the server, so this removes
 * it from the studio rather than destroying the drafts inside it.
 */
function ProjectTile({ card, onOpen, onDelete }: { card: ProjectCard; onOpen: () => void; onDelete?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const still = useReducedMotion();
  return (
    <motion.div
      layout
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: DECODE_EASE } }}
      whileHover={still ? undefined : { y: -1 }}
      whileTap={still ? undefined : { scale: 0.994 }}
      transition={{ duration: 0.15, ease: DECODE_EASE }}
      className="studio-shell group relative flex min-h-[250px] flex-col"
    >
      <button type="button" onClick={onOpen} className="studio-surface flex flex-1 flex-col p-5 text-left transition-shadow duration-[var(--t-fast)] ease-decode group-hover:shadow-md">
        <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-t8 uppercase">
          {card.status === "Working" && <WorkingDot />}
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
          className="absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full text-t9 transition-[color,background-color] duration-[var(--t-fast)] ease-decode hover:bg-sunken hover:text-ink"
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
