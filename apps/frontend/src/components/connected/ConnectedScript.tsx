"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, TriangleAlert } from "lucide-react";
import { ConnectedProjectFrame } from "@/components/connected/ConnectedProjectFrame";
import { ScriptStage } from "@/components/project/stages/Script";
import { Graphite, Spinner, StageKicker, cx } from "@/components/ui/primitives";
import { decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import { startsOf } from "@/lib/derive";
import type {
  ArtifactVersion,
  ScriptPayload,
  StudioSnapshot,
  TeachingPlanBeat,
  TeachingPlanPayload,
} from "@/lib/types";

export function ConnectedScript({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const [viewed, setViewed] = useState<ArtifactVersion<ScriptPayload> | null>(null);
  const [plan, setPlan] = useState<TeachingPlanPayload | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
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

    // The plan comes along for the ride: a passage on its own says nothing
    // about whether it landed the beat it was written for.
    const planArtifact = nextStudio.artifacts.find(
      (item) => item.artifact_type === "teaching_plan",
    );
    if (planArtifact) {
      const planResult = await decodeApi.getTeachingPlan(projectId, planArtifact.artifact_id);
      const approved =
        planResult.items.find((item) => item.version_id === planResult.approved_version_id) ??
        planResult.items[0];
      setPlan(approved?.payload ?? null);
    }

    const script = nextStudio.artifacts.find((item) => item.artifact_type === "script");
    if (!script) {
      setArtifactId(null);
      setLatestId(null);
      setApprovedId(null);
      setViewed(null);
      return;
    }
    setArtifactId(script.artifact_id);
    const result = await decodeApi.getScript(projectId, script.artifact_id);
    setLatestId(result.latest_version_id);
    setApprovedId(result.approved_version_id);
    setViewed(
      result.items.find((item) => item.version_id === result.latest_version_id) ??
        result.items[0] ??
        null,
    );
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setError("");
    load()
      .catch((cause: unknown) => {
        if (active) setError(creatorError(cause, "We couldn’t load this script."));
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const scriptJob = [studio?.active_job, studio?.most_recent_job].find(
    (job) => job?.kind === "generate_script" && job.status !== "succeeded",
  );
  const scriptRunning = scriptJob?.status === "queued" || scriptJob?.status === "running";

  useEffect(() => {
    if (!scriptRunning || viewed) return;
    const poll = window.setInterval(() => {
      void load().catch((cause: unknown) => {
        setError(creatorError(cause, "We couldn’t refresh the Writer’s progress."));
      });
    }, 1500);
    return () => window.clearInterval(poll);
  }, [load, scriptRunning, viewed]);

  const startScript = async () => {
    const planArtifact = studio?.artifacts.find((item) => item.artifact_type === "teaching_plan");
    if (!planArtifact?.approved_version_id || busy) return;
    const existing = studio?.active_job ?? studio?.most_recent_job;
    if (existing?.kind === "generate_script" && existing.status !== "succeeded") {
      if (existing.status === "failed") {
        router.push(`/studio/projects/${projectId}/jobs/${existing.job_id}`);
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The intent that informed the approved plan, not whatever is newest —
      // the backend refuses any other, and it is right to.
      const informedBy = await decodeApi.getLineage(
        projectId,
        planArtifact.artifact_id,
        planArtifact.approved_version_id,
      );
      const intent = informedBy.parents.find(
        (parent) => parent.artifact_type === "production_intent",
      );
      if (!intent) throw new Error("The production direction for this plan is unavailable.");
      const fingerprint = `generate-script:${planArtifact.approved_version_id}:${intent.version_id}`;
      await decodeApi.generateScript(
        projectId,
        planArtifact.approved_version_id,
        intent.version_id,
        keyFor(fingerprint),
      );
      commandKeys.current.delete(fingerprint);
      router.push(`/studio/projects/${projectId}/edit`);
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t start the script."));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Save an edit to one passage.
   *
   * The whole script goes back, because a version is a complete replacement —
   * there is no patch. Approval is deliberately not reset here: publishing a
   * new version moves `latest` while `approved` stays where it was, so the
   * stage reads as awaiting review again on its own.
   */
  const editNarration = async (index: number, text: string) => {
    if (!artifactId || !viewed || busy) return;
    const current = viewed.payload.beats[index];
    if (!current || current.narration === text || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await decodeApi.editScript(
        projectId,
        artifactId,
        viewed.version_id,
        {
          ...viewed.payload,
          beats: viewed.payload.beats.map((beat, i) =>
            i === index ? { ...beat, narration: text } : beat,
          ),
        },
        // A fresh key per save: each edit is its own command, and reusing one
        // would replay the first edit's response for the second.
        idempotencyKey(),
      );
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t save that change."));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!artifactId || !viewed || busy) return;
    setBusy(true);
    setError("");
    const fingerprint = `approve-script:${artifactId}:${viewed.version_id}`;
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
      setError(creatorError(cause, "We couldn’t approve this script."));
    } finally {
      setBusy(false);
    }
  };

  const payload = viewed?.payload;
  const approved = viewed?.version_id === approvedId;
  const isLatest = viewed?.version_id === latestId;
  const planApproved = studio?.artifacts.some(
    (item) => item.artifact_type === "teaching_plan" && item.approved_version_id,
  );
  const fixture = payload?.script_findings.fixture === true;
  const beatsById = new Map<string, TeachingPlanBeat>(
    (plan?.beats ?? []).flatMap((beat) => (beat.id ? [[beat.id, beat] as const] : [])),
  );

  return (
    <ConnectedProjectFrame
      projectId={projectId}
      studio={studio}
      activeStage="script"
      statusLabel={`Script · ${initialLoading ? "loading" : payload ? "saved" : "not started"}`}
      loading={initialLoading}
    >
      {!payload ? (
        initialLoading ? (
          <ScriptSkeleton />
        ) : scriptRunning ? (
          <ScriptInProgress />
        ) : scriptJob?.status === "failed" ? (
          <ScriptFailure
            message="The Writer couldn’t finish this script. Your approved plan is safe."
            onRetry={() => router.push(`/studio/projects/${projectId}/jobs/${scriptJob.job_id}`)}
            actionLabel="Open recovery"
          />
        ) : error && (!studio || artifactId) ? (
          <ScriptFailure message={error} onRetry={() => void load()} />
        ) : (
          <main className="mx-auto w-full max-w-[920px] p-4 sm:p-6 lg:p-8">
            <div className="studio-shell">
              <div className="studio-surface p-6 sm:p-8">
                <StageKicker>Script</StageKicker>
                <h1 className="mt-4 font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1] tracking-[-0.04em]">
                  {planApproved ? "The Writer is ready when you are" : "Approve the Teaching Plan first"}
                </h1>
                <p className="mt-4 max-w-[62ch] text-[13.5px] leading-[1.7] text-t6">
                  {planApproved
                    ? "Your approved plan is safe. The Writer turns each beat into the words a viewer hears, written to the seconds you already signed off on."
                    : "The Writer works from the Teaching Plan you approved — the beats and their durations are the budget it writes against."}
                </p>
                <Graphite
                  onClick={() =>
                    planApproved
                      ? void startScript()
                      : router.push(`/studio/projects/${projectId}/teaching-plan`)
                  }
                  disabled={busy}
                  className="mt-6 px-5 py-2.5 text-[13px] font-medium"
                >
                  {planApproved
                    ? busy
                      ? "Starting the Writer…"
                      : "Start Script"
                    : "Review Teaching Plan"}
                </Graphite>
                {error && <p role="alert" className="mt-4 text-[12px] text-[#8E2F19]">{error}</p>}
              </div>
            </div>
          </main>
        )
      ) : (
        <ScriptStage
          rows={payload.beats.map((entry) => {
            const beat = beatsById.get(entry.beat_id);
            return {
              id: entry.beat_id,
              narration: entry.narration,
              dur: beat?.target_duration_seconds ?? 0,
              objective: beat?.objective,
            };
          })}
          startAt={startsOf(
            payload.beats.map(
              (entry) => beatsById.get(entry.beat_id)?.target_duration_seconds ?? 0,
            ),
          )}
          selected={selected}
          approved={approved}
          message={`I wrote narration for all ${payload.beats.length} beats, timed to the durations you approved.`}
          why={payload.rationale}
          notice={
            fixture ? (
              <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-[12px] text-t7">
                This is deterministic sample narration. It demonstrates the real review and
                approval flow without claiming the Writer read your plan.
              </p>
            ) : null
          }
          status={approved ? "Approved" : isLatest ? "Ready for review" : "Earlier draft"}
          handoff="Script approved. The Motion Designer builds the scene visuals next."
          approveLabel={busy ? "Saving…" : "Approve Script"}
          approveDisabled={busy}
          onSelect={setSelected}
          onEditNarration={(index, text) => void editNarration(index, text)}
          onApprove={() => void approve()}
          onPushBack={() => router.push(`/studio/projects/${projectId}/teaching-plan`)}
          onNext={() => router.push(`/studio/projects/${projectId}/edit`)}
          secondaryLabel="Back to the plan"
        />
      )}
    </ConnectedProjectFrame>
  );
}

function ScriptSkeleton() {
  return (
    <main
      aria-live="polite"
      aria-busy="true"
      className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <span className="sr-only">Loading the script, its word budgets and approval state.</span>
      <div className="studio-surface p-6">
        <div className="h-3 w-24 rounded-full bg-sunken-3" />
        <div className="mt-4 h-9 w-1/2 rounded-xl bg-sunken-3" />
        <div className="mt-5 h-20 rounded-xl bg-sunken-3" />
      </div>
      {[0, 1, 2].map((item) => (
        <div key={item} className="studio-surface h-32 bg-card p-5">
          <div className="h-4 w-1/3 rounded-full bg-sunken-3" />
          <div className="mt-4 h-3 w-full rounded-full bg-sunken-3" />
          <div className="mt-2 h-3 w-4/5 rounded-full bg-sunken-3" />
        </div>
      ))}
    </main>
  );
}

function ScriptInProgress() {
  return (
    <main aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8">
      <div className="studio-shell">
        <section className="studio-surface p-6 sm:p-8">
          <StageKicker>Writer at work</StageKicker>
          <h1 className="mt-4 font-display text-[clamp(30px,4vw,46px)] font-semibold leading-none tracking-[-0.04em]">
            Writing the narration
          </h1>
          <p className="mt-4 max-w-[62ch] text-[13.5px] leading-[1.7] text-t6">
            The Writer is turning each approved beat into the words a viewer hears. You can move
            elsewhere in the project while this continues.
          </p>

          <div className="mt-7 overflow-hidden rounded-[16px] border border-line-input bg-sunken">
            <ProgressRow
              state="done"
              title="Plan received"
              detail="The approved beats and their durations are the budget."
            />
            <ProgressRow
              state="active"
              title="Writing and checking each passage"
              detail="Working to the seconds each beat was given, then checking the words fit."
            />
            <ProgressRow
              state="pending"
              title="Ready for your review"
              detail="The finished script will appear here."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProgressRow({
  state,
  title,
  detail,
}: {
  state: "done" | "active" | "pending";
  title: string;
  detail: string;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-line-div px-4 py-3.5 last:border-0",
        state === "pending" && "opacity-45",
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        {state === "done" ? (
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-[10px] text-white">
            ✓
          </span>
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

function ScriptFailure({
  message,
  onRetry,
  actionLabel = "Retry",
}: {
  message: string;
  onRetry: () => void;
  actionLabel?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8">
      <div role="alert" className="studio-surface p-6 sm:p-8">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken-3 text-accent-deep">
          <TriangleAlert size={17} />
        </span>
        <StageKicker className="mt-5">Script</StageKicker>
        <h1 className="mt-3 font-display text-[clamp(26px,4vw,40px)] font-semibold tracking-[-0.035em]">
          The script didn’t open
        </h1>
        <p className="mt-3 max-w-[58ch] text-[13px] leading-[1.65] text-t6">{message}</p>
        <Graphite onClick={onRetry} className="mt-6 flex min-h-10 items-center gap-2 px-4 text-[12.5px] font-medium">
          <RotateCw size={13} />
          {actionLabel}
        </Graphite>
      </div>
    </main>
  );
}
