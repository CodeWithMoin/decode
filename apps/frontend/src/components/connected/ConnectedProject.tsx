"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { HandoffBar, HandoffBrief } from "@/components/crew/HandoffCard";
import { Graphite, Micro, StageKicker, cx } from "@/components/ui/primitives";
import { DecodeApiError, decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type {
  ArtifactLineageResponse,
  ArtifactVersion,
  EvaluationSummary,
  ProductionBriefPayload,
  ProductionBriefProjection,
  StudioSnapshot,
} from "@/lib/types";

const STAGES = ["Understanding", "Teaching Plan", "Script", "Edit", "Export"];

export function ConnectedProject({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [brief, setBrief] = useState<ProductionBriefProjection | null>(null);
  const [viewed, setViewed] = useState<ArtifactVersion<ProductionBriefPayload> | null>(null);
  const [history, setHistory] = useState<ArtifactVersion<ProductionBriefPayload>[]>([]);
  const [lineage, setLineage] = useState<ArtifactLineageResponse | null>(null);
  const [panel, setPanel] = useState<"none" | "edit" | "history">("none");
  const [draft, setDraft] = useState<ProductionBriefPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    return nextBrief;
  };

  useEffect(() => {
    let active = true;
    load().catch((cause: unknown) => {
      if (active) setError(creatorError(cause, "We couldn’t load this production brief."));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route identity owns this fetch
  }, [projectId]);

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

  return (
    <div className="flex min-h-dvh bg-page">
      <nav aria-label="Stages" className="panel-glass sticky top-0 hidden h-dvh w-[200px] flex-none flex-col border-r border-line-head p-3 lg:flex">
        <button onClick={() => router.push("/studio")} className="mb-5 flex items-center gap-2 rounded-full px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-white/60"><ArrowLeft size={14} /> Studio</button>
        <div className="px-2.5 font-mono text-[8.5px] tracking-[0.12em] text-t9 uppercase">Current project</div>
        <ul className="mt-2 flex list-none flex-col gap-0.5 p-0">
          {STAGES.map((stage, index) => <li key={stage}><div className={cx("flex items-center gap-2.5 rounded-full px-2.5 py-2 text-[13px]", index === 0 ? "bg-white font-medium shadow-nav" : "text-t9")}><span className="w-5 font-mono text-[9px] text-t9">{String(index + 1).padStart(2, "0")}</span><span className="flex-1">{stage}</span>{index > 0 && <Lock size={11} aria-label="Not available yet" />}</div></li>)}
        </ul>
        <div className="mt-auto rounded-[14px] border border-line-input bg-card p-3"><div className="font-mono text-[8.5px] text-t9 uppercase">Sources</div><div className="mt-1 text-[12px] font-medium">{studio?.sources.length ?? 0} attached</div></div>
      </nav>

      <div className="min-w-0 flex-1">
        <header className="panel-glass sticky top-0 z-30 flex items-center gap-3 border-b border-line-head px-4 py-2.5">
          <button onClick={() => router.push("/studio")} aria-label="Back to projects" className="grid h-9 w-9 place-items-center rounded-full border border-line-input bg-card lg:hidden"><ArrowLeft size={14} /></button>
          <span className="min-w-0 truncate font-display text-[14.5px] font-semibold">{projectTitle}</span>
          <span className="hidden rounded-full border border-line-input bg-sunken px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-t6 uppercase sm:inline">Production brief · saved</span>
          <button disabled className="ml-auto rounded-full border border-line-input bg-sunken px-3 py-2 text-[12px] text-t9" title="Production room is not available yet">Production room · not available yet</button>
          <Graphite disabled className="px-4 py-2 text-[13px] opacity-50">Export · not available yet</Graphite>
        </header>
        <div className="panel-glass flex gap-1.5 overflow-x-auto border-b border-line-head px-3 py-2 lg:hidden">{STAGES.map((stage, index) => <span key={stage} className={cx("flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] whitespace-nowrap", index === 0 ? "bg-white font-medium" : "text-t9")}>{stage}{index > 0 && <Lock size={10} />}</span>)}</div>

        {!payload ? <div className="mx-auto max-w-[900px] p-8"><StageKicker>Understanding</StageKicker><p className="mt-3 text-[13px] text-t7">{error || "Loading Production Brief…"}</p></div> : (
          <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-6 pb-[var(--handoff-h)] lg:p-8 lg:pb-[var(--handoff-h)]">
            <div><StageKicker>{isPreview ? "Sample production brief" : "Production brief"}</StageKicker><h1 className="mt-1 font-display text-[26px] font-semibold">{payload.title}</h1><p className="mt-2 max-w-[68ch] text-[14px] leading-[1.6] text-t6">{payload.summary}</p>{isPreview && <p className="mt-2 max-w-[68ch] rounded-xl bg-sunken px-3 py-2 text-[12px] text-t7">This preview demonstrates editing, approval, and history. It has not analyzed the contents of your source yet.</p>}<div className="mt-3 flex flex-wrap gap-2 font-mono text-[9.5px] uppercase text-t7"><span>Draft {viewed?.sequence}</span><span>· {isLatest ? "current" : "earlier"}</span><span>· {approved ? "approved" : "awaiting approval"}</span><button onClick={() => void openHistory()} className="ml-2 text-accent-deep underline underline-offset-2">Draft history</button></div></div>

            <div className="grid gap-3 sm:grid-cols-3"><Stat label="Main ideas" value={`${payload.key_concepts.filter((item) => item.importance === "core").length}`} sub={`${payload.key_concepts.length} ideas in this brief`} /><Stat label="Who this is for" value={payload.audience_profile} sub="How this brief is being shaped" wrap /><Stat label="Sources" value={`${studio?.sources.length ?? 0}`} sub={isPreview ? "Attached to this project" : "Used for this brief"} /></div>

            <HandoffBrief crew="producer" message={isPreview ? "I’ve used your production choices to create a sample brief you can review and shape." : "I’ve turned your sources and production choices into a brief you can review and shape."} why="This gives the rest of the production a clear audience, focus, and learning goal." />
            {brief?.latest_evaluation && isLatest && <QualityCheck evaluation={brief.latest_evaluation} />}

            <Concepts concepts={payload.key_concepts} />
            <ListSection title="What learners should take away" items={payload.learning_objectives} />
            <div className="grid gap-4 md:grid-cols-2"><ListSection title="What learners should already know" items={payload.prerequisites} /><ListSection title="Questions to resolve" items={payload.open_questions} empty="Nothing needs clarification right now." /><ListSection title="What to include" items={payload.scope_in} /><ListSection title="What to leave out" items={payload.scope_out} /></div>
            <section className="rounded-2xl border border-line bg-card p-5"><h2 className="font-display text-[15px] font-semibold">Ways to explain it</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{payload.teaching_opportunities.map((item) => <div key={`${item.title}-${item.rationale}`} className="rounded-xl bg-sunken p-3"><div className="text-[13px] font-medium">{item.title}</div><div className="mt-1 text-[12px] leading-[1.5] text-t7">{item.rationale}</div></div>)}</div></section>
            <SourcesUsed sources={studio?.sources ?? []} preview={isPreview} />

            {panel === "edit" && draft && <EditPanel draft={draft} setDraft={setDraft} onCancel={() => setPanel("none")} onSave={() => void save()} busy={busy} />}
            {panel === "history" && <HistoryPanel versions={history} latestId={brief?.latest_version_id} approvedId={brief?.approved_version_id} selectedId={viewed?.version_id} lineage={lineage} onSelect={(version) => void inspectVersion(version)} onClose={() => setPanel("none")} />}
            {error && <p role="alert" className="rounded-xl border border-[#E7C8BF] bg-[#FFF5F2] p-3 text-[12px] text-[#8E2F19]">{error}</p>}
            <HandoffBar crew="producer" status={approved ? "Brief approved" : isLatest ? "Ready for your review" : "Viewing an earlier draft"} approved={approved} handoff="Brief approved. Your teaching plan is the next step." approveLabel={busy ? "Saving…" : "Approve brief"} approveDisabled={!canApprove || busy} onApprove={() => void approve()} onPushBack={canEdit ? openEdit : () => void openHistory()} secondaryLabel={canEdit ? "Edit brief" : "View history"} />
            {!canApprove && <p className="text-[11px] text-t7">This brief can’t be approved right now. Refresh the page and try again.</p>}
          </main>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, wrap = false }: { label: string; value: string; sub: string; wrap?: boolean }) { return <div className="flex min-h-[96px] flex-col rounded-2xl border border-line-input bg-card p-4"><Micro>{label}</Micro><div className={cx("mt-1.5 font-display text-[18px] font-semibold", wrap ? "break-words text-[14px]" : "truncate")}>{value}</div><div className="mt-auto pt-2 text-[12px] text-t7">{sub}</div></div>; }
function Concepts({ concepts }: { concepts: ProductionBriefPayload["key_concepts"] }) { return <section className="rounded-2xl border border-line bg-card p-5"><h2 className="font-display text-[15px] font-semibold">Key ideas</h2><div className="mt-3 flex flex-wrap gap-2">{concepts.map((item) => <span key={`${item.name}-${item.importance}`} className={cx("rounded-full border px-3 py-1.5 text-[12.5px]", item.importance === "core" ? "border-[var(--accent-line)] bg-[var(--accent-tint)]" : "border-line-input bg-sunken")}>{item.name}<span className="ml-1.5 font-mono text-[8px] uppercase text-t8">{item.importance === "core" ? "main" : "supporting"}</span></span>)}</div></section>; }
function ListSection({ title, items, empty = "None recorded." }: { title: string; items: string[]; empty?: string }) { return <section className="rounded-2xl border border-line bg-card p-5"><h2 className="font-display text-[15px] font-semibold">{title}</h2>{items.length ? <ol className="mt-3 space-y-2 pl-5 text-[13px] leading-[1.55] text-ink-2">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol> : <p className="mt-3 text-[12px] text-t7">{empty}</p>}</section>; }

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

function SourcesUsed({ sources, preview }: { sources: StudioSnapshot["sources"]; preview: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-[15px] font-semibold">{preview ? "Sources attached" : "Sources used"}</h2>
      <p className="mt-1 text-[12px] text-t7">{preview ? "These materials are saved with your project. Source analysis is not included in this preview." : "These are the materials Decode used for this brief."}</p>
      {sources.length > 0 ? <ul className="mt-3 space-y-2 p-0">{sources.map((source, index) => <li key={source.source_id} className="flex list-none items-center gap-3 rounded-xl bg-sunken p-3"><span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-white font-mono text-[9px] text-t7">{index + 1}</span><span className="min-w-0 truncate text-[12.5px] font-medium">{source.filename || source.title || `Source ${index + 1}`}</span></li>)}</ul> : <p className="mt-3 text-[12px] text-t7">No sources are attached.</p>}
    </section>
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
  return <section className="rounded-2xl border border-[var(--accent-line)] bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Edit production brief</h2><span className="font-mono text-[9px] uppercase text-t8">Your current brief stays in history</span></div><div className="mt-4 grid gap-3"><label className="text-[11px] text-t7">Title<input className={field} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="text-[11px] text-t7">Summary<textarea rows={3} className={field} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label><label className="text-[11px] text-t7">Who this is for<textarea rows={2} className={field} value={draft.audience_profile} onChange={(event) => setDraft({ ...draft, audience_profile: event.target.value })} /></label>{(["learning_objectives", "prerequisites", "scope_in", "scope_out", "open_questions"] as const).map((key) => <label key={key} className="text-[11px] text-t7">{listLabels[key]} · one per line<textarea rows={3} className={field} value={draft[key].join("\n")} onChange={(event) => setList(key, event.target.value)} /></label>)}<label className="text-[11px] text-t7">Key ideas · idea | main or supporting<textarea rows={4} className={field} value={draft.key_concepts.map((item) => `${item.name} | ${item.importance === "core" ? "main" : "supporting"}`).join("\n")} onChange={(event) => setDraft({ ...draft, key_concepts: event.target.value.split("\n").map((line) => { const [name, importance] = line.split("|").map((part) => part.trim()); return { name, importance: importance === "supporting" ? "supporting" as const : "core" as const }; }).filter((item) => item.name) })} /></label><label className="text-[11px] text-t7">Ways to explain it · idea | why it helps<textarea rows={4} className={field} value={draft.teaching_opportunities.map((item) => `${item.title} | ${item.rationale}`).join("\n")} onChange={(event) => setDraft({ ...draft, teaching_opportunities: event.target.value.split("\n").map((line) => { const [title, ...rest] = line.split("|"); return { title: title.trim(), rationale: rest.join("|").trim() }; }).filter((item) => item.title) })} /></label></div><div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} className="rounded-full px-4 py-2 text-[12px] text-t6">Cancel</button><Graphite onClick={onSave} disabled={busy} className="px-4 py-2 text-[12px]">{busy ? "Saving…" : "Save changes"}</Graphite></div></section>;
}

function draftDetailLabel(parent: ArtifactLineageResponse["parents"][number]) {
  if (parent.artifact_type === "source") return "A source was attached when this draft was created";
  if (parent.artifact_type === "production_intent") return "Used your production choices";
  if (parent.artifact_type === "production_brief") return `Created from Draft ${parent.sequence}`;
  return "Project input";
}

function HistoryPanel({ versions, latestId, approvedId, selectedId, lineage, onSelect, onClose }: { versions: ArtifactVersion<ProductionBriefPayload>[]; latestId?: string; approvedId?: string | null; selectedId?: string; lineage: ArtifactLineageResponse | null; onSelect: (version: ArtifactVersion<ProductionBriefPayload>) => void; onClose: () => void }) { return <section className="rounded-2xl border border-line bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Draft history</h2><button onClick={onClose} className="text-[12px] text-t6">Close</button></div><div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,.7fr)]"><div className="space-y-2">{versions.map((version) => <button key={version.version_id} onClick={() => onSelect(version)} className={cx("flex w-full items-center gap-3 rounded-xl border p-3 text-left", version.version_id === selectedId ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-line-input bg-sunken")}><span className="font-display text-[15px] font-semibold">Draft {version.sequence}</span><span className="min-w-0 flex-1 truncate text-[11px] text-t7">{new Date(version.created_at).toLocaleString()}</span>{version.version_id === latestId && <span className="font-mono text-[8px] uppercase">Current</span>}{version.version_id === approvedId && <span className="font-mono text-[8px] uppercase text-accent-deep">Approved</span>}</button>)}</div><div className="rounded-xl bg-sunken p-4"><div className="font-mono text-[9px] uppercase text-t8">Draft details</div>{lineage ? lineage.parents.length > 0 ? <ul className="mt-2 space-y-2 p-0">{lineage.parents.map((parent) => <li key={parent.version_id} className="list-none rounded-lg bg-white px-2.5 py-2 text-[11.5px] text-t6">{draftDetailLabel(parent)}</li>)}</ul> : <p className="mt-2 text-[12px] text-t7">This was the first draft.</p> : <p className="mt-2 text-[12px] text-t7">Choose a draft to see how it was created.</p>}</div></div></section>; }
