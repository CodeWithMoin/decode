"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, TriangleAlert } from "lucide-react";
import { ConnectedProjectFrame } from "@/components/connected/ConnectedProjectFrame";
import { HandoffBar, HandoffBrief } from "@/components/crew/HandoffCard";
import { Graphite, Micro, Spinner, StageKicker, cx } from "@/components/ui/primitives";
import { decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import { fmt, num } from "@/lib/derive";
import type {
  ArtifactLineageResponse,
  ArtifactVersion,
  StudioSnapshot,
  TeachingPlanBeat,
  TeachingPlanPayload,
} from "@/lib/types";

const LEGACY_SECTIONS = {
  problem: { label: "Act I", title: "The problem", purpose: "Establish why the mechanism matters." },
  mechanism: { label: "Act II", title: "The mechanism", purpose: "Build how the idea works." },
  payoff: { label: "Act III", title: "The payoff", purpose: "Show what the idea enables." },
};

type PlanGroup = {
  id: string;
  label: string;
  title: string;
  purpose: string;
  beats: Array<{ beat: TeachingPlanBeat; index: number; start: number }>;
};

export function ConnectedTeachingPlan({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const [viewed, setViewed] = useState<ArtifactVersion<TeachingPlanPayload> | null>(null);
  const [history, setHistory] = useState<ArtifactVersion<TeachingPlanPayload>[]>([]);
  const [lineage, setLineage] = useState<ArtifactLineageResponse | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandKeys = useRef(new Map<string, string>());

  const keyFor = (fingerprint: string) => {
    const existing = commandKeys.current.get(fingerprint);
    if (existing) return existing;
    const key = idempotencyKey();
    commandKeys.current.set(fingerprint, key);
    return key;
  };

  const load = useCallback(async () => {
    const nextStudio = await decodeApi.getStudio(projectId);
    setStudio(nextStudio);
    const plan = nextStudio.artifacts.find((item) => item.artifact_type === "teaching_plan");
    if (!plan) {
      setArtifactId(null);
      setLatestId(null);
      setApprovedId(null);
      setViewed(null);
      setHistory([]);
      setLineage(null);
      return;
    }
    setArtifactId(plan.artifact_id);
    const result = await decodeApi.getTeachingPlan(projectId, plan.artifact_id);
    setLatestId(result.latest_version_id);
    setApprovedId(result.approved_version_id);
    setHistory(result.items);
    const selected = result.items.find((item) => item.version_id === result.latest_version_id) ?? result.items[0] ?? null;
    setViewed(selected);
    if (selected) {
      decodeApi
        .getLineage(projectId, plan.artifact_id, selected.version_id)
        .then(setLineage)
        .catch(() => setLineage(null));
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setError("");
    load()
      .catch((cause: unknown) => {
        if (active) setError(creatorError(cause, "We couldn’t load this Teaching Plan."));
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const planJob = [studio?.active_job, studio?.most_recent_job].find(
    (job) => job?.kind === "generate_teaching_plan" && job.status !== "succeeded",
  );
  const planRunning = planJob?.status === "queued" || planJob?.status === "running";

  useEffect(() => {
    if (!planRunning || viewed) return;
    const poll = window.setInterval(() => {
      void load().catch((cause: unknown) => {
        setError(creatorError(cause, "We couldn’t refresh the Director’s progress."));
      });
    }, 1500);
    return () => window.clearInterval(poll);
  }, [load, planRunning, viewed]);

  const retry = async () => {
    setInitialLoading(true);
    setError("");
    try {
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t load this Teaching Plan."));
    } finally {
      setInitialLoading(false);
    }
  };

  const startPlan = async () => {
    const brief = studio?.artifacts.find((item) => item.artifact_type === "production_brief");
    if (!brief?.approved_version_id || busy) return;
    const existingJob = studio?.active_job ?? studio?.most_recent_job;
    if (existingJob?.kind === "generate_teaching_plan" && existingJob.status !== "succeeded") {
      if (existingJob.status === "failed") {
        router.push(`/studio/projects/${projectId}/jobs/${existingJob.job_id}`);
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const informedBy = await decodeApi.getLineage(
        projectId,
        brief.artifact_id,
        brief.approved_version_id,
      );
      const intent = informedBy.parents.find(
        (parent) => parent.artifact_type === "production_intent",
      );
      if (!intent) throw new Error("The production direction for this brief is unavailable.");
      const fingerprint = `generate-plan:${brief.approved_version_id}:${intent.version_id}`;
      await decodeApi.generateTeachingPlan(
        projectId,
        brief.approved_version_id,
        intent.version_id,
        keyFor(fingerprint),
      );
      commandKeys.current.delete(fingerprint);
      router.push(`/studio/projects/${projectId}/script`);
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t start the Teaching Plan."));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!artifactId || !viewed || busy) return;
    setBusy(true);
    setError("");
    const fingerprint = `approve-plan:${artifactId}:${viewed.version_id}`;
    try {
      await decodeApi.approveArtifact(
        projectId,
        artifactId,
        viewed.version_id,
        null,
        keyFor(fingerprint),
      );
      commandKeys.current.delete(fingerprint);
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t approve this Teaching Plan."));
    } finally {
      setBusy(false);
    }
  };

  const inspect = async (version: ArtifactVersion<TeachingPlanPayload>) => {
    if (!artifactId) return;
    setViewed(version);
    setLineage(null);
    try {
      setLineage(await decodeApi.getLineage(projectId, artifactId, version.version_id));
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t load what informed this plan."));
    }
  };

  const payload = viewed?.payload;
  const approved = viewed?.version_id === approvedId;
  const isLatest = viewed?.version_id === latestId;
  const runtime = payload?.beats.reduce(
    (sum, beat) => sum + beat.target_duration_seconds,
    0,
  ) ?? 0;
  const groups = payload ? groupBeats(payload) : [];
  const fixture = payload?.plan_findings.fixture === true;
  const briefApproved = studio?.artifacts.some(
    (item) => item.artifact_type === "production_brief" && item.approved_version_id,
  );

  return (
    <ConnectedProjectFrame
      projectId={projectId}
      studio={studio}
      activeStage="plan"
      statusLabel={`Teaching Plan · ${initialLoading ? "loading" : payload ? "saved" : "not started"}`}
      loading={initialLoading}
    >
      {!payload ? initialLoading ? (
        <TeachingPlanSkeleton />
      ) : planRunning ? (
        <PlanInProgress />
      ) : planJob?.status === "failed" ? (
        <PlanFailure
          message="The Director couldn’t finish this Teaching Plan. Your approved brief is safe."
          onRetry={() => router.push(`/studio/projects/${projectId}/jobs/${planJob.job_id}`)}
          actionLabel="Open recovery"
        />
      ) : error && (!studio || artifactId) ? (
        <PlanFailure message={error} onRetry={() => void retry()} />
      ) : (
        <main className="mx-auto w-full max-w-[920px] p-4 sm:p-6 lg:p-8">
          <div className="studio-shell">
            <div className="studio-surface p-6 sm:p-8">
              <StageKicker>Teaching Plan</StageKicker>
              <h1 className="mt-4 font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1] tracking-[-0.04em]">
                {briefApproved ? "The Director is ready when you are" : "Approve Understanding first"}
              </h1>
              <p className="mt-4 max-w-[62ch] text-[13.5px] leading-[1.7] text-t6">
                {briefApproved
                  ? "Your approved brief is safe. Start the Teaching Plan to shape its ideas into ordered beats and a runtime arc."
                  : "The Director works from the Production Brief you approved, never from an unfinished draft."}
              </p>
              <Graphite onClick={() => briefApproved ? void startPlan() : router.push(`/studio/projects/${projectId}/understanding`)} disabled={busy} className="mt-6 px-5 py-2.5 text-[13px] font-medium">
                {briefApproved ? busy ? "Starting the Director…" : "Start Teaching Plan" : "Review Production Brief"}
              </Graphite>
              {error && <p role="alert" className="mt-4 text-[12px] text-[#8E2F19]">{error}</p>}
            </div>
          </div>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 pb-[var(--handoff-h)] sm:p-6 lg:p-8 lg:pb-[var(--handoff-h)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <StageKicker>Teaching Plan</StageKicker>
              <h1 className="mt-1 font-display text-[clamp(24px,3.5vw,34px)] font-semibold tracking-[-0.025em]">
                {payload.structure_name ?? `${groups.length} part plan`} · {payload.beats.length} beat{payload.beats.length === 1 ? "" : "s"}
              </h1>
            </div>
            <div className="text-right">
              <Micro>Total runtime</Micro>
              <div className="mt-1 font-mono text-[19px] tabular-nums">{fmt(runtime)}</div>
            </div>
          </div>

          <HandoffBrief
            crew="director"
            message={`I shaped the brief into ${payload.beats.length} teaching beats. ${payload.through_line}`}
            why={payload.rationale}
          />

          {fixture && (
            <p className="rounded-xl bg-sunken px-3 py-2 text-[12px] text-t7">
              This is a deterministic sample plan. It demonstrates the real review, lineage, and approval flow without claiming model reasoning.
            </p>
          )}

          {viewed.latest_evaluation ? (
            <details
              open={viewed.latest_evaluation.decision !== "pass" || undefined}
              className="studio-surface overflow-hidden"
            >
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-[12.5px] font-medium text-ink-2 sm:px-5">
                Plan quality review
                <span className="ml-auto rounded-full bg-sunken-3 px-2.5 py-1 font-mono text-[8.5px] tracking-[0.08em] text-t6 uppercase">
                  {viewed.latest_evaluation.decision === "pass" ? "Passed" : "Needs attention"}
                </span>
              </summary>
              <div className="border-t border-line-div px-4 py-4 sm:px-5">
                <p className="text-[12.5px] leading-[1.65] text-t6">{viewed.latest_evaluation.summary}</p>
                {viewed.latest_evaluation.checks.some((check) => check.outcome !== "pass") ? (
                  <div className="mt-3 grid gap-2">
                    {viewed.latest_evaluation.checks.filter((check) => check.outcome !== "pass").map((check) => (
                      <p key={check.name} className="rounded-xl bg-sunken px-3 py-2 text-[11.5px] leading-[1.55] text-t6">
                        <span className="font-medium text-ink-2">{check.name.replaceAll("_", " ")}:</span>{" "}
                        {check.evidence}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}

          <RuntimeArc beats={payload.beats} runtime={runtime} groups={groups} />

          {groups.map((group) => {
            const duration = group.beats.reduce(
              (sum, item) => sum + item.beat.target_duration_seconds,
              0,
            );
            return (
              <section key={`${group.id}-${group.beats[0]?.index}`}>
                <div className="mb-3 flex items-center gap-3">
                  <StageKicker>{group.title}</StageKicker>
                  <div className="h-px flex-1 bg-line-input" aria-hidden />
                  <span className="font-mono text-[9.5px] tracking-[0.1em] text-t7 uppercase">
                    {group.label} · {fmt(duration)}
                  </span>
                </div>
                <p className="-mt-1 mb-3 max-w-[68ch] text-[12px] leading-[1.6] text-t7">{group.purpose}</p>
                <div className="relative grid gap-2.5">
                  <div className="absolute top-3 bottom-3 left-[7px] w-px bg-line-input" aria-hidden />
                  {group.beats.map(({ beat, index, start }) => (
                    <article key={`${index}-${beat.title}`} className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-3">
                      <span className="relative z-[1] mt-5 h-[15px] w-[15px] rounded-full border-[3px] border-sunken-2 bg-line-strong" aria-hidden />
                      <div className="studio-surface p-4 sm:p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[9px] text-t8">{num(index)}</span>
                          <h2 className="font-display text-[16px] font-semibold">{beat.title}</h2>
                          <span className="ml-auto font-mono text-[10px] text-t7 tabular-nums">
                            {fmt(start)} · {fmt(beat.target_duration_seconds)}
                          </span>
                        </div>
                        <p className="mt-3 text-[12.5px] leading-[1.6] text-t6">
                          <span className="font-mono text-[8.5px] tracking-[0.1em] text-t8 uppercase">Viewer outcome</span>{" "}
                          {beat.objective}
                        </p>
                        {(beat.key_points?.length || beat.depends_on?.length || beat.example || beat.visual_opportunity) && (
                          <details className="mt-3 border-t border-line-div pt-3">
                            <summary className="cursor-pointer text-[12px] font-medium text-ink-2">Why this scene?</summary>
                            <div className="mt-3 grid gap-3 text-[11.5px] leading-[1.6] text-t6">
                              {beat.key_points?.length ? (
                                <div>
                                  <Micro>Key teaching points</Micro>
                                  <ul className="mt-1.5 space-y-1 pl-4">{beat.key_points.map((point) => <li key={point}>{point}</li>)}</ul>
                                </div>
                              ) : null}
                              {beat.depends_on?.length ? <Detail label="Builds on" value={dependencyLabels(beat.depends_on, payload.beats)} /> : null}
                              {beat.example ? <Detail label="Possible example" value={beat.example} /> : null}
                              {beat.visual_opportunity ? <Detail label="Visual opportunity" value={beat.visual_opportunity} /> : null}
                            </div>
                          </details>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          {historyOpen && (
            <PlanHistory
              versions={history}
              latestId={latestId}
              approvedId={approvedId}
              selectedId={viewed.version_id}
              lineage={lineage}
              onSelect={(version) => void inspect(version)}
              onClose={() => setHistoryOpen(false)}
            />
          )}
          {error && <p role="alert" className="rounded-xl border border-[#E7C8BF] bg-[#FFF5F2] p-3 text-[12px] text-[#8E2F19]">{error}</p>}

          <HandoffBar
            crew="director"
            status={approved ? "Approved" : isLatest ? "Ready for review" : "Earlier plan"}
            approved={approved}
            handoff="Teaching Plan approved. Script is the next connected stage to build."
            nextLabel="Next: Script"
            approveLabel={busy ? "Saving…" : "Approve Teaching Plan"}
            approveDisabled={busy || studio?.allowed_actions.can_approve_plan === false}
            onApprove={() => void approve()}
            onPushBack={() => setHistoryOpen(true)}
            secondaryLabel="View history"
            approvedSecondaryLabel="View history"
          />
        </main>
      )}
    </ConnectedProjectFrame>
  );
}

function groupBeats(payload: TeachingPlanPayload): PlanGroup[] {
  const sections = new Map(
    payload.sections?.map((section, index) => [section.id, { ...section, label: `Part ${index + 1}` }]) ?? [],
  );
  let elapsed = 0;
  const groups: PlanGroup[] = [];
  payload.beats.forEach((beat, index) => {
    const id = beat.section_id ?? beat.act ?? "plan";
    const legacy = beat.act ? LEGACY_SECTIONS[beat.act] : undefined;
    const section = sections.get(id);
    let group = groups[groups.length - 1];
    if (!group || group.id !== id) {
      group = {
        id,
        label: section?.label ?? legacy?.label ?? `Part ${groups.length + 1}`,
        title: section?.title ?? legacy?.title ?? "Teaching sequence",
        purpose: section?.purpose ?? legacy?.purpose ?? "Build understanding in the order this material needs.",
        beats: [],
      };
      groups.push(group);
    }
    group.beats.push({ beat, index, start: elapsed });
    elapsed += beat.target_duration_seconds;
  });
  return groups;
}

function RuntimeArc({ beats, runtime, groups }: { beats: TeachingPlanBeat[]; runtime: number; groups: PlanGroup[] }) {
  return (
    <section aria-label="Runtime arc" className="studio-surface p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Micro>Runtime arc</Micro>
        <span className="font-mono text-[9.5px] text-t7 uppercase">{fmt(runtime)} across {beats.length} beats</span>
      </div>
      <div className="flex gap-[3px]" aria-hidden>
        {beats.map((beat, index) => (
          <span key={`${index}-${beat.title}`} className="h-[10px] min-w-[6px] rounded-full bg-line-soft" style={{ flexGrow: beat.target_duration_seconds, flexBasis: 0 }} />
        ))}
      </div>
      <div className="mt-3 flex gap-3">
        {groups.map((group) => {
          const duration = group.beats.reduce((sum, item) => sum + item.beat.target_duration_seconds, 0);
          return (
            <div key={`${group.id}-${group.beats[0]?.index}`} className="min-w-0 border-t border-line-input pt-2" style={{ flexGrow: duration, flexBasis: 0 }}>
              <div className="font-mono text-[9px] tracking-[0.1em] text-t8 uppercase">{group.label}</div>
              <div className="truncate text-[12.5px] font-medium">{group.title}</div>
              <div className="mt-0.5 font-mono text-[10px] text-t7">{fmt(duration)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function dependencyLabels(ids: string[], beats: TeachingPlanBeat[]) {
  const titles = new Map(beats.map((beat) => [beat.id, beat.title]));
  return ids.map((id) => titles.get(id) ?? id).join(", ");
}

function Detail({ label, value }: { label: string; value: string }) {
  return <p><span className="font-medium text-ink-2">{label}:</span> {value}</p>;
}

function PlanHistory({ versions, latestId, approvedId, selectedId, lineage, onSelect, onClose }: { versions: ArtifactVersion<TeachingPlanPayload>[]; latestId: string | null; approvedId: string | null; selectedId: string; lineage: ArtifactLineageResponse | null; onSelect: (version: ArtifactVersion<TeachingPlanPayload>) => void; onClose: () => void }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-[17px] font-semibold">Plan history</h2><button onClick={onClose} className="text-[12px] text-t6">Close</button></div>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,.7fr)]">
        <div className="space-y-2">
          {versions.map((version) => (
            <button key={version.version_id} onClick={() => onSelect(version)} className={cx("flex w-full items-center gap-3 rounded-xl border p-3 text-left", version.version_id === selectedId ? "border-[var(--accent)] bg-[var(--accent-tint)]" : "border-line-input bg-sunken")}>
              <span className="font-display text-[15px] font-semibold">Plan {version.sequence}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-t7">{new Date(version.created_at).toLocaleString()}</span>
              {version.version_id === latestId && <span className="font-mono text-[8px] uppercase">Current</span>}
              {version.version_id === approvedId && <span className="font-mono text-[8px] text-accent-deep uppercase">Approved</span>}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-sunken p-4">
          <Micro>What informed this plan</Micro>
          {lineage ? lineage.parents.length > 0 ? (
            <ul className="mt-3 space-y-2 p-0">
              {lineage.parents.map((parent) => <li key={parent.version_id} className="list-none rounded-lg bg-white px-2.5 py-2 text-[11.5px] text-t6">{parent.artifact_type === "production_brief" ? `Approved Production Brief · draft ${parent.sequence}` : "Your production direction"}</li>)}
            </ul>
          ) : <p className="mt-3 text-[12px] text-t7">No parent artifacts were recorded.</p> : <p className="mt-3 text-[12px] text-t7">Choose a plan to inspect its lineage.</p>}
        </div>
      </div>
    </section>
  );
}

function TeachingPlanSkeleton() {
  return <main aria-live="polite" aria-busy="true" className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:p-6 lg:p-8"><span className="sr-only">Loading the Teaching Plan, runtime, and approval state.</span><div className="studio-surface p-6"><div className="h-3 w-28 rounded-full bg-sunken-3" /><div className="mt-4 h-9 w-2/3 rounded-xl bg-sunken-3" /><div className="mt-5 h-24 rounded-xl bg-sunken-3" /></div>{[0, 1, 2].map((item) => <div key={item} className="studio-surface h-28 bg-card p-5"><div className="h-4 w-1/3 rounded-full bg-sunken-3" /><div className="mt-4 h-3 w-4/5 rounded-full bg-sunken-3" /></div>)}</main>;
}

function PlanInProgress() {
  return (
    <main aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8">
      <div className="studio-shell">
        <section className="studio-surface p-6 sm:p-8">
          <StageKicker>Director at work</StageKicker>
          <h1 className="mt-4 font-display text-[clamp(30px,4vw,46px)] font-semibold leading-none tracking-[-0.04em]">
            Shaping the Teaching Plan
          </h1>
          <p className="mt-4 max-w-[62ch] text-[13.5px] leading-[1.7] text-t6">
            The Director is turning your approved brief into ordered teaching beats. You can move elsewhere in the project while this continues.
          </p>

          <div className="mt-7 overflow-hidden rounded-[16px] border border-line-input bg-sunken">
            <ProgressRow state="done" title="Direction received" detail="The approved brief is ready for the Director." />
            <ProgressRow state="active" title="Shaping and reviewing teaching beats" detail="Ordering the lesson, budgeting time, and checking the Writer handoff." />
            <ProgressRow state="pending" title="Ready for your review" detail="The finished Teaching Plan will appear here." />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProgressRow({ state, title, detail }: { state: "done" | "active" | "pending"; title: string; detail: string }) {
  return (
    <div className={cx("grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-line-div px-4 py-3.5 last:border-0", state === "pending" && "opacity-45")}>
      <span className="flex h-5 w-5 items-center justify-center">
        {state === "done" ? (
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-[10px] text-white">✓</span>
        ) : state === "active" ? (
          <Spinner size={14} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        )}
      </span>
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-t7">{detail}</span>
      </span>
    </div>
  );
}

function PlanFailure({ message, onRetry, actionLabel = "Retry" }: { message: string; onRetry: () => void; actionLabel?: string }) {
  return <main className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8"><div role="alert" className="studio-surface p-6 sm:p-8"><span className="grid h-10 w-10 place-items-center rounded-full bg-sunken-3 text-accent-deep"><TriangleAlert size={17} /></span><StageKicker className="mt-5">Teaching Plan</StageKicker><h1 className="mt-3 font-display text-[clamp(26px,4vw,40px)] font-semibold tracking-[-0.035em]">The Teaching Plan didn’t open</h1><p className="mt-3 max-w-[58ch] text-[13px] leading-[1.65] text-t6">{message}</p><Graphite onClick={onRetry} className="mt-6 flex min-h-10 items-center gap-2 px-4 text-[12.5px] font-medium"><RotateCw size={13} />{actionLabel}</Graphite></div></main>;
}
