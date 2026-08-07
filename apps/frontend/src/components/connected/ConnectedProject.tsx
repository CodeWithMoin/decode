"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, RotateCw, TriangleAlert } from "lucide-react";
import { RailFrame } from "@/components/app/RailFrame";
import { StageRail } from "@/components/app/StageRail";
import { StudioNav } from "@/components/app/StudioNav";
import { HandoffBar, HandoffBrief } from "@/components/crew/HandoffCard";
import { Graphite, Micro, StageKicker, cx } from "@/components/ui/primitives";
import { DecodeApiError, decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type {
  ArtifactLineageResponse,
  ArtifactVersion,
  EvaluationSummary,
  ProductionBriefPayload,
  ProductionIntentPayload,
  ProductionBriefProjection,
  StudioSnapshot,
  TabId,
} from "@/lib/types";

/** Only Understanding is connected in this milestone; the rest stay visible and locked. */
const stageState = (tab: TabId) => ({ locked: tab !== "overview" });

export function ConnectedProject({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [intent, setIntent] = useState<ProductionIntentPayload | null>(null);
  const [brief, setBrief] = useState<ProductionBriefProjection | null>(null);
  const [viewed, setViewed] = useState<ArtifactVersion<ProductionBriefPayload> | null>(null);
  const [history, setHistory] = useState<ArtifactVersion<ProductionBriefPayload>[]>([]);
  const [lineage, setLineage] = useState<ArtifactLineageResponse | null>(null);
  const [panel, setPanel] = useState<"none" | "edit" | "history">("none");
  const [draft, setDraft] = useState<ProductionBriefPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const commandKeys = useRef(new Map<string, string>());
  const keyFor = (fingerprint: string) => {
    const existing = commandKeys.current.get(fingerprint);
    if (existing) return existing;
    const key = idempotencyKey();
    commandKeys.current.set(fingerprint, key);
    return key;
  };

  const load = async () => {
    const [nextStudio, nextBrief] = await Promise.all([
      decodeApi.getStudio(projectId),
      decodeApi.getBrief(projectId),
    ]);
    setStudio(nextStudio);
    setBrief(nextBrief);
    setViewed(nextBrief.latest_version);

    // The creator's direction, for the Target and depth stats. Deliberately not
    // in the Promise.all above: its artifact id comes from the snapshot, and a
    // brief that renders without it is still a brief. A failure here dims two
    // stats rather than emptying the screen.
    const intentArtifact = nextStudio.artifacts.find(
      (item) => item.artifact_type === "production_intent",
    );
    if (intentArtifact) {
      decodeApi
        .getIntent(projectId, intentArtifact.artifact_id)
        .then((response) => setIntent(response.items[0]?.payload ?? null))
        .catch(() => setIntent(null));
    }
    return nextBrief;
  };

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setError("");
    load().catch((cause: unknown) => {
      if (active) setError(creatorError(cause, "We couldn’t load this production brief."));
    }).finally(() => {
      if (active) setInitialLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route identity owns this fetch
  }, [projectId]);

  const retryInitialLoad = async () => {
    setInitialLoading(true);
    setError("");
    try {
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t load this production brief."));
    } finally {
      setInitialLoading(false);
    }
  };

  const openEdit = () => {
    if (!viewed || viewed.version_id !== brief?.latest_version_id) return;
    setDraft(structuredClone(viewed.payload));
    setPanel("edit");
    setError("");
  };

  const save = async () => {
    if (!draft || !brief || !viewed || busy) return;
    setBusy(true);
    setError("");
    const fingerprint = `edit:${viewed.version_id}:${JSON.stringify(draft)}`;
    try {
      await decodeApi.editBrief(projectId, brief.artifact_id, viewed.version_id, draft, keyFor(fingerprint));
      await load();
      commandKeys.current.delete(fingerprint);
      setPanel("none");
    } catch (cause) {
      if (cause instanceof DecodeApiError && cause.problem.code === "artifact_version_conflict") {
        setError("Someone saved a newer draft while you were editing. Your changes are still here; refresh when you’re ready.");
      } else setError(creatorError(cause, "We couldn’t save your changes. Your draft is still here."));
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!brief || !viewed || busy) return;
    setBusy(true);
    setError("");
    const fingerprint = `approve:${brief.artifact_id}:${viewed.version_id}`;
    try {
      await decodeApi.approveBrief(projectId, brief.artifact_id, viewed.version_id, null, keyFor(fingerprint));
      const next = await decodeApi.getBrief(projectId);
      commandKeys.current.delete(fingerprint);
      setBrief(next);
      if (viewed.version_id === next.latest_version.version_id) setViewed(next.latest_version);
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t approve this brief. Please try again."));
    } finally { setBusy(false); }
  };

  const openHistory = async () => {
    if (!brief) return;
    setPanel("history");
    setError("");
    try {
      const result = await decodeApi.getHistory(projectId, brief.artifact_id);
      setHistory(result.items);
    } catch (cause) { setError(creatorError(cause, "We couldn’t load the draft history.")); }
  };

  const inspectVersion = async (version: ArtifactVersion<ProductionBriefPayload>) => {
    if (!brief) return;
    setViewed(version);
    setLineage(null);
    try { setLineage(await decodeApi.getLineage(projectId, brief.artifact_id, version.version_id)); }
    catch (cause) { setError(creatorError(cause, "We couldn’t load what informed this draft.")); }
  };

  const payload = viewed?.payload;
  const isLatest = viewed?.version_id === brief?.latest_version_id;
  const approved = viewed?.version_id === brief?.approved_version_id;
  const canEdit = Boolean(isLatest && studio?.allowed_actions.can_edit_brief !== false);
  const canApprove = Boolean(studio?.allowed_actions.can_approve_brief !== false);
  const projectTitle = studio?.project.title ?? payload?.title ?? "Decode project";
  const isPreview = payload?.source_findings.fixture === true;
  const passingCheck =
    isLatest && brief?.latest_evaluation?.decision === "pass" ? brief.latest_evaluation : null;

  return (
    <div className="app-field flex min-h-dvh gap-3 p-0 lg:p-3">
      <nav aria-label="Stages" className="app-rail sticky top-3 hidden h-[calc(100dvh-24px)] w-[208px] flex-none flex-col rounded-[22px] p-3 lg:flex">
        <RailFrame connected footer={
          <div className="studio-shell rounded-[16px] p-[3px]">
            <div className="studio-surface-muted rounded-[13px] p-3">
              <div className="font-mono text-[8.5px] text-t9 uppercase">Sources</div>
              <div className="mt-1 text-[12px] font-medium">{studio ? `${studio.sources.length} attached` : "Checking sources"}</div>
            </div>
          </div>
        }>
          <StudioNav active="none" connected />

          <div className="mt-4 border-t border-line-head pt-4">
            <div className="mb-2 px-2.5 font-mono text-[8.5px] tracking-[0.12em] text-t9 uppercase">Current project</div>
            <StageRail variant="rail" active="overview" state={stageState} />
          </div>
        </RailFrame>
      </nav>

      <div className="min-w-0 flex-1">
        <header className="panel-glass sticky top-0 z-30 mb-0 flex items-center gap-3 border-b border-line-head px-4 py-2.5 lg:top-3 lg:mb-3 lg:rounded-[18px] lg:border lg:border-white/80 lg:shadow-sm">
          <button onClick={() => router.push("/studio")} aria-label="Back to projects" className="grid h-9 w-9 place-items-center rounded-full border border-line-input bg-card lg:hidden"><ArrowLeft size={14} /></button>
          <span className="min-w-0 flex-1 truncate font-display text-[14.5px] font-semibold">{studio || payload ? projectTitle : "Opening project"}</span>
          <span className="hidden rounded-full border border-line-input bg-sunken px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-t6 uppercase sm:inline">Production brief · {initialLoading ? "loading" : payload ? "saved" : "unavailable"}</span>
          <Graphite disabled className="ml-auto px-4 py-2 text-[13px] opacity-50">Export · not available yet</Graphite>
        </header>
        <StageRail variant="strip" active="overview" state={stageState} />

        {!payload ? initialLoading ? (
          <ConnectedProjectSkeleton />
        ) : (
          <ProjectLoadFailure message={error || "We couldn’t load this production brief."} onRetry={() => void retryInitialLoad()} onBack={() => router.push("/studio")} />
        ) : (
          <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 pb-[var(--handoff-h)] sm:p-6 lg:p-8 lg:pb-[var(--handoff-h)]">
            <div className="studio-shell">
              <div className="studio-surface p-6 sm:p-8">
                <span className="studio-eyebrow">{isPreview ? "Sample production brief" : "Production brief"}</span>
                <h1 className="mt-5 max-w-[880px] font-display text-[clamp(30px,4vw,50px)] font-semibold leading-[1] tracking-[-0.04em]">{payload.title}</h1>
                <p className="mt-4 max-w-[68ch] text-[14px] leading-[1.7] text-t6">{payload.summary}</p>
                {isPreview && <p className="mt-4 max-w-[68ch] rounded-xl bg-sunken px-3 py-2 text-[12px] text-t7">This preview demonstrates editing, approval, and history. It has not analyzed the contents of your source yet.</p>}
                <div className="mt-5 flex flex-wrap gap-2 font-mono text-[9.5px] uppercase text-t7"><span>Draft {viewed?.sequence}</span><span>· {isLatest ? "current" : "earlier"}</span><span>· {approved ? "approved" : "awaiting approval"}</span><button onClick={() => void openHistory()} className="ml-2 text-accent-deep underline underline-offset-2">Draft history</button></div>
              </div>
            </div>

            {/* Four facts about the production, matching the shape the
                prototype settled on: what it teaches, who for, how long, from
                what. Target and depth come from the creator's own direction, so
                the row reads as "here is what you asked for, and here is what I
                understood" rather than four numbers about the brief. */}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}>
              <Stat label="Concepts" value={`${payload.key_concepts.length}`} sub={`${payload.key_concepts.filter((item) => item.importance === "core").length} carry the story`} />
              <Stat label="Audience" value={payload.audience_profile} sub={intent ? DEPTH_LABELS[intent.depth] : "How this brief is being shaped"} wrap />
              <Stat label="Target" value={intent ? runtimeLabel(intent) : "—"} sub="requested" />
              <Stat label="Source" value={sourceValue(studio)} sub={sourceSub(studio, isPreview)} wrap />
            </div>

            <HandoffBrief crew="producer" message={isPreview ? "I’ve used your production choices to create a sample brief you can review and shape." : "I’ve turned your sources and production choices into a brief you can review and shape."} why="This gives the rest of the production a clear audience, focus, and learning goal." />
            {/* A passing check is reassurance, not news — it belongs with the
                supporting detail. A failing one is the reason you are here, so
                it stays at top level. Never hide a problem, never headline a
                non-problem. */}
            {brief?.latest_evaluation && isLatest && brief.latest_evaluation.decision !== "pass" && <QualityCheck evaluation={brief.latest_evaluation} />}

            {/* Ordered by the one decision this screen asks for — "is this the
                video I want?". What it teaches, then the boundary, then what is
                still open. Everything that does not move that decision is a
                click away rather than a scroll away. */}
            <ListSection title="What learners should take away" items={payload.learning_objectives} />
            <div className="grid gap-4 md:grid-cols-2"><ListSection title="What to include" items={payload.scope_in} /><ListSection title="What to leave out" items={payload.scope_out} /></div>
            <ListSection title="Questions to resolve" items={payload.open_questions} empty="Nothing needs clarification right now." />
            <MoreDetail hint={passingCheck ? "Key ideas · prerequisites · checks" : "Key ideas · prerequisites"}>
              <Concepts concepts={payload.key_concepts} />
              <ListSection title="What learners should already know" items={payload.prerequisites} />
              {passingCheck && <QualityCheck evaluation={passingCheck} />}
            </MoreDetail>

            {panel === "edit" && draft && <EditPanel draft={draft} setDraft={setDraft} onCancel={() => setPanel("none")} onSave={() => void save()} busy={busy} />}
            {panel === "history" && <HistoryPanel versions={history} latestId={brief?.latest_version_id} approvedId={brief?.approved_version_id} selectedId={viewed?.version_id} lineage={lineage} onSelect={(version) => void inspectVersion(version)} onClose={() => setPanel("none")} />}
            {error && <p role="alert" className="rounded-xl border border-[#E7C8BF] bg-[#FFF5F2] p-3 text-[12px] text-[#8E2F19]">{error}</p>}
            <HandoffBar crew="producer" status={approved ? "Approved" : isLatest ? "Ready for review" : "Earlier draft"} approved={approved} handoff="Brief approved. Your teaching plan is the next step." nextLabel="Next: Teaching Plan" approveLabel={busy ? "Saving…" : "Approve and plan"} approveDisabled={!canApprove || busy} onApprove={() => void approve()} onPushBack={canEdit ? openEdit : () => void openHistory()} secondaryLabel={canEdit ? "Request changes" : "View history"} approvedSecondaryLabel="View history" />
            {!canApprove && <p className="text-[11px] text-t7">This brief can’t be approved right now. Refresh the page and try again.</p>}
          </main>
        )}
      </div>
    </div>
  );
}

function ConnectedProjectSkeleton() {
  return (
    <main aria-live="polite" aria-busy="true" className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 pb-[var(--handoff-h)] sm:p-6 lg:p-8 lg:pb-[var(--handoff-h)]">
      <div className="studio-shell">
        <div className="studio-surface p-6 sm:p-8">
          <span className="studio-eyebrow">Production brief</span>
          <span className="sr-only">Loading the current draft, sources, and latest review.</span>
          <div className="mt-5 grid max-w-[880px] gap-2.5" aria-hidden>
            <span className="h-9 w-[86%] rounded-xl bg-sunken-3 sm:h-11" />
            <span className="h-9 w-[58%] rounded-xl bg-sunken-3 sm:h-11" />
          </div>
          <div className="mt-5 grid max-w-[68ch] gap-2" aria-hidden>
            <span className="h-3 w-full rounded-full bg-sunken-3" />
            <span className="h-3 w-[92%] rounded-full bg-sunken-3" />
            <span className="h-3 w-[72%] rounded-full bg-sunken-3" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2" aria-hidden>
            <span className="h-3 w-12 rounded-full bg-sunken-3" />
            <span className="h-3 w-16 rounded-full bg-sunken-3" />
            <span className="h-3 w-20 rounded-full bg-sunken-3" />
            <span className="ml-2 h-3 w-16 rounded-full bg-sunken-3" />
          </div>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}>
        {["Concepts", "Audience", "Target", "Source"].map((label) => (
          <div key={label} className="flex min-h-[96px] flex-col rounded-2xl border border-line-input bg-card p-4">
            <Micro>{label}</Micro>
            <span className="mt-3 h-4 w-2/3 rounded-full bg-sunken-3" />
            <span className="mt-auto h-3 w-1/2 rounded-full bg-sunken-3" />
          </div>
        ))}
      </div>

      <div className="studio-surface px-5 py-4 shadow-sm">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="h-[26px] w-[26px] rounded-full bg-sunken-3" />
          <span className="text-[13px] font-semibold text-ink">Producer</span>
          <span className="ml-auto font-mono text-[9.5px] tracking-[0.12em] text-t6 uppercase">Production brief</span>
        </div>
        <div className="h-3 w-5/6 rounded-full bg-sunken-3" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-sunken-3" />
        <div className="mt-3 rounded-xl bg-sunken-2 px-3 py-2.5">
          <span className="block h-3 w-3/4 rounded-full bg-sunken-3" />
        </div>
      </div>

      <SkeletonListSection title="What learners should take away" />
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonListSection title="What to include" />
        <SkeletonListSection title="What to leave out" />
      </div>
      <SkeletonListSection title="Questions to resolve" />

      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="font-display text-[15px] font-semibold text-ink">Supporting detail</h2>
      </section>

      <div className="sticky bottom-3 z-[4] rounded-[18px] border border-line-input bg-card px-4 py-3 shadow-sticky-up">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-[26px] w-[26px] rounded-full bg-sunken-3" />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-ink">Producer</span>
            <span className="block font-mono text-[8px] tracking-[0.1em] text-t6 uppercase">Production brief</span>
          </span>
          <span className="h-6 w-24 rounded-full bg-sunken-3" />
          <span className="min-w-[180px] flex-1 text-[11.5px] text-t6">Next: Teaching Plan</span>
          <span className="h-8 w-24 rounded-full bg-sunken-3" />
          <span className="h-8 w-28 rounded-full bg-sunken-3" />
        </div>
      </div>
    </main>
  );
}

function SkeletonListSection({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
      <div className="mt-4 grid gap-3" aria-hidden>
        <span className="h-3 w-full rounded-full bg-sunken-3" />
        <span className="h-3 w-5/6 rounded-full bg-sunken-3" />
        <span className="h-3 w-2/3 rounded-full bg-sunken-3" />
      </div>
    </section>
  );
}

function ProjectLoadFailure({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8">
      <div role="alert" className="studio-shell">
        <div className="studio-surface p-6 sm:p-8">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken-3 text-accent-deep" aria-hidden><TriangleAlert size={17} strokeWidth={1.8} /></span>
          <StageKicker className="mt-5">Understanding</StageKicker>
          <h1 className="mt-3 font-display text-[clamp(26px,4vw,40px)] font-semibold tracking-[-0.035em] text-ink">The production brief didn’t open</h1>
          <p className="mt-3 max-w-[58ch] text-[13px] leading-[1.65] text-t6">{message}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Graphite type="button" onClick={onRetry} className="flex min-h-10 items-center gap-2 px-4 text-[12.5px] font-medium"><RotateCw size={13} strokeWidth={1.8} aria-hidden />Retry</Graphite>
            <button type="button" onClick={onBack} className="min-h-10 rounded-full border border-line-input bg-sunken px-4 text-[12.5px] font-medium text-ink-2 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:bg-white">Back to studio</button>
          </div>
        </div>
      </div>
    </main>
  );
}

const DEPTH_LABELS: Record<string, string> = {
  intuition_first: "Intuition first",
  balanced: "Balanced",
  rigorous: "Rigorous",
};

/** Minutes, or the honest answer when the creator asked for no fixed length. */
const runtimeLabel = (intent: ProductionIntentPayload) =>
  intent.target_duration_seconds
    ? `${intent.target_duration_seconds / 60} min`
    : "Deep dive";

/**
 * The prototype shows "11 pp · 5,214 words" here. The backend stores no page or
 * word count — only filename and size — so this says what it actually knows.
 * Claiming a page count nothing counted is the same fault as claiming a citation.
 */
const sourceValue = (studio: StudioSnapshot | null) => {
  const sources = studio?.sources ?? [];
  if (sources.length === 0) return "None yet";
  if (sources.length > 1) return `${sources.length} files`;
  return sources[0].filename || sources[0].title || "1 file";
};

const sourceSub = (studio: StudioSnapshot | null, preview: boolean) => {
  const sources = studio?.sources ?? [];
  if (sources.length === 0) return preview ? "Attached to this project" : "Used for this brief";
  const bytes = sources.reduce((sum, item) => sum + (item.size_bytes ?? 0), 0);
  if (!bytes) return preview ? "Attached to this project" : "Used for this brief";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Step the size down at 16 and 26 characters — never line-clamp.
 *
 * Only the Audience stat needs this (`wrap`), and it is the one value nobody
 * controls: free text from the creator, sharpened by a model. Every sibling in
 * the row inherits its height, so an unbounded string leaves the numbers beside
 * it floating in white space. Clamping is the wrong fix — it would hide the
 * creator's own description of their audience, which is the whole point of the
 * card. Shrinking keeps all of it readable.
 */
const statSize = (value: string) =>
  value.length > 26 ? "text-[13px]" : value.length > 16 ? "text-[15px]" : "text-[18px]";

function Stat({ label, value, sub, wrap = false }: { label: string; value: string; sub: string; wrap?: boolean }) { return <div className="flex min-h-[96px] flex-col rounded-2xl border border-line-input bg-card p-4"><Micro>{label}</Micro><div className={cx("mt-1.5 font-display font-semibold", wrap ? cx("break-words", statSize(value)) : "truncate text-[18px]")}>{value}</div><div className="mt-auto pt-2 text-[12px] text-t7">{sub}</div></div>; }
function Concepts({ concepts }: { concepts: ProductionBriefPayload["key_concepts"] }) { return <section className="rounded-2xl border border-line bg-card p-5"><h2 className="font-display text-[15px] font-semibold">Key ideas</h2><div className="mt-3 flex flex-wrap gap-2">{concepts.map((item) => <span key={`${item.name}-${item.importance}`} className={cx("rounded-full border px-3 py-1.5 text-[12.5px]", item.importance === "core" ? "border-[var(--accent-line)] bg-[var(--accent-tint)]" : "border-line-input bg-sunken")}>{item.name}<span className="ml-1.5 font-mono text-[8px] uppercase text-t8">{item.importance === "core" ? "main" : "supporting"}</span></span>)}</div></section>; }
/**
 * Supporting detail, collapsed.
 *
 * `<details>` rather than state: it is keyboard accessible and findable by
 * in-page search for free, and it holds no React state that could disagree with
 * what is on screen. Closed by default — the brief is approved from the summary,
 * scope and open questions above it, and everything here is confirmation rather
 * than decision.
 */
function MoreDetail({ hint, children }: { hint: string; children: React.ReactNode }) {
  return <details className="group rounded-2xl border border-line bg-card"><summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-display text-[15px] font-semibold [&::-webkit-details-marker]:hidden">Supporting detail<ChevronDown size={14} className="text-t7 transition-transform duration-[var(--t-fast)] group-open:rotate-180" /><span className="ml-auto font-mono text-[9.5px] uppercase text-t8 group-open:hidden">{hint}</span></summary><div className="flex flex-col gap-5 px-5 pb-5 [&_details]:border-0 [&_details]:p-0 [&_section]:border-0 [&_section]:bg-transparent [&_section]:p-0">{children}</div></details>;
}
function ListSection({ title, items, empty = "None recorded." }: { title: string; items: string[]; empty?: string }) { return <section className="rounded-2xl border border-line bg-card p-5"><h2 className="font-display text-[15px] font-semibold">{title}</h2>{items.length ? <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-[1.55] text-ink-2 marker:text-t8">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="mt-3 text-[12px] text-t7">{empty}</p>}</section>; }

const QUALITY_LABELS: Record<string, string> = {
  objectives_present: "Learning goals",
  concepts_present: "Key ideas",
};

function QualityCheck({ evaluation }: { evaluation: EvaluationSummary }) {
  const checks = evaluation.checks.filter((check) => QUALITY_LABELS[check.name]);
  const hiddenFailures = evaluation.checks.filter(
    (check) => !QUALITY_LABELS[check.name] && check.outcome !== "pass",
  );
  const visibleFailures = checks.filter((check) => check.outcome !== "pass");
  const unexplainedAttention = evaluation.decision === "needs_attention" && visibleFailures.length === 0;
  const status = visibleFailures.length > 0
    ? "Needs your attention"
    : hiddenFailures.length > 0 || unexplainedAttention || evaluation.decision === "unable_to_evaluate"
      ? "Check incomplete"
      : "Ready to review";
  const summary = visibleFailures.length === 0 && hiddenFailures.length === 0 && evaluation.decision === "pass"
    ? "The brief has the basics in place. You still make the final call."
    : visibleFailures.length > 0
      ? "Decode found parts of the brief that may need a closer look."
      : "Decode couldn’t complete every check. Review the brief before continuing.";
  return (
    <details className="group rounded-2xl border border-line bg-card p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <h2 className="font-display text-[15px] font-semibold">Quality check</h2>
        <span className="font-mono text-[9px] uppercase text-accent-deep">{status}</span>
      </summary>
      <p className="mt-3 text-[13px] text-t6">{summary}</p>
      {checks.length > 0 && <ul className="mt-3 space-y-2 p-0">{checks.map((check) => <li key={check.name} className="flex list-none items-center justify-between gap-3 rounded-xl bg-sunken p-3 text-[12px]"><span className="font-medium">{QUALITY_LABELS[check.name]}</span><span className="text-t7">{check.outcome === "pass" ? "Looks good" : "Needs attention"}</span></li>)}</ul>}
      {(hiddenFailures.length > 0 || unexplainedAttention) && <p className="mt-3 rounded-xl bg-sunken p-3 text-[12px] text-t7">One check couldn’t be completed. Review the brief before approving it.</p>}
    </details>
  );
}


function EditPanel({ draft, setDraft, onCancel, onSave, busy }: { draft: ProductionBriefPayload; setDraft: (value: ProductionBriefPayload) => void; onCancel: () => void; onSave: () => void; busy: boolean }) {
  const setList = (key: "learning_objectives" | "prerequisites" | "scope_in" | "scope_out" | "open_questions", value: string) => setDraft({ ...draft, [key]: value.split("\n").map((item) => item.trim()).filter(Boolean) });
  const listLabels = {
    learning_objectives: "What learners should take away",
    prerequisites: "What learners should already know",
    scope_in: "What to include",
    scope_out: "What to leave out",
    open_questions: "Questions to resolve",
  } as const;
  const field = "w-full rounded-xl border border-line-input bg-white px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]";
  return <section className="rounded-2xl border border-[var(--accent-line)] bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Edit production brief</h2><span className="font-mono text-[9px] uppercase text-t8">Your current brief stays in history</span></div><div className="mt-4 grid gap-3"><label className="text-[11px] text-t7">Title<input className={field} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="text-[11px] text-t7">Summary<textarea rows={3} className={field} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label><label className="text-[11px] text-t7">Who this is for<textarea rows={2} className={field} value={draft.audience_profile} onChange={(event) => setDraft({ ...draft, audience_profile: event.target.value })} /></label>{(["learning_objectives", "prerequisites", "scope_in", "scope_out", "open_questions"] as const).map((key) => <label key={key} className="text-[11px] text-t7">{listLabels[key]} · one per line<textarea rows={3} className={field} value={draft[key].join("\n")} onChange={(event) => setList(key, event.target.value)} /></label>)}<label className="text-[11px] text-t7">Key ideas · idea | main or supporting<textarea rows={4} className={field} value={draft.key_concepts.map((item) => `${item.name} | ${item.importance === "core" ? "main" : "supporting"}`).join("\n")} onChange={(event) => setDraft({ ...draft, key_concepts: event.target.value.split("\n").map((line) => { const [name, importance] = line.split("|").map((part) => part.trim()); return { name, importance: importance === "supporting" ? "supporting" as const : "core" as const }; }).filter((item) => item.name) })} /></label></div><div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} className="rounded-full px-4 py-2 text-[12px] text-t6">Cancel</button><Graphite onClick={onSave} disabled={busy} className="px-4 py-2 text-[12px]">{busy ? "Saving…" : "Save changes"}</Graphite></div></section>;
}

function draftDetailLabel(parent: ArtifactLineageResponse["parents"][number]) {
  if (parent.artifact_type === "source") return "A source was attached when this draft was created";
  if (parent.artifact_type === "production_intent") return "Used your production choices";
  if (parent.artifact_type === "production_brief") return `Created from Draft ${parent.sequence}`;
  return "Project input";
}

function HistoryPanel({ versions, latestId, approvedId, selectedId, lineage, onSelect, onClose }: { versions: ArtifactVersion<ProductionBriefPayload>[]; latestId?: string; approvedId?: string | null; selectedId?: string; lineage: ArtifactLineageResponse | null; onSelect: (version: ArtifactVersion<ProductionBriefPayload>) => void; onClose: () => void }) { return <section className="rounded-2xl border border-line bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Draft history</h2><button onClick={onClose} className="text-[12px] text-t6">Close</button></div><div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,.7fr)]"><div className="space-y-2">{versions.map((version) => <button key={version.version_id} onClick={() => onSelect(version)} className={cx("flex w-full items-center gap-3 rounded-xl border p-3 text-left", version.version_id === selectedId ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-line-input bg-sunken")}><span className="font-display text-[15px] font-semibold">Draft {version.sequence}</span><span className="min-w-0 flex-1 truncate text-[11px] text-t7">{new Date(version.created_at).toLocaleString()}</span>{version.version_id === latestId && <span className="font-mono text-[8px] uppercase">Current</span>}{version.version_id === approvedId && <span className="font-mono text-[8px] uppercase text-accent-deep">Approved</span>}</button>)}</div><div className="rounded-xl bg-sunken p-4"><div className="font-mono text-[9px] uppercase text-t8">Draft details</div>{lineage ? lineage.parents.length > 0 ? <ul className="mt-2 space-y-2 p-0">{lineage.parents.map((parent) => <li key={parent.version_id} className="list-none rounded-lg bg-white px-2.5 py-2 text-[11.5px] text-t6">{draftDetailLabel(parent)}</li>)}</ul> : <p className="mt-2 text-[12px] text-t7">This was the first draft.</p> : <p className="mt-2 text-[12px] text-t7">Choose a draft to see how it was created.</p>}</div></div></section>; }
