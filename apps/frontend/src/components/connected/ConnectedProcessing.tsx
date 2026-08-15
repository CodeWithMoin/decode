"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppMark, Graphite, Spinner, cx } from "@/components/ui/primitives";
import { decodeApi, idempotencyKey, streamProjectEvents } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type { JobDetail, ProjectEvent, StudioSnapshot } from "@/lib/types";

// One build screen for the whole run, not a page per stage. Each stage is done
// when its artifact exists, active when its job is running, pending otherwise —
// derived from the project snapshot, so the checklist advances in place and the
// screen lands in the cutting room the moment scenes exist (voice trickles in
// there). This is the single-workspace build: watch it come together, then edit.
const PIPELINE = [
  {
    artifact: "production_brief",
    job: "generate_production_brief",
    label: "Understanding your source",
    detail: "Turning your material and production choices into a reviewable brief.",
  },
  {
    artifact: "teaching_plan",
    job: "generate_teaching_plan",
    label: "Shaping the teaching plan",
    detail: "Ordering the lesson and budgeting time for each idea.",
  },
  {
    artifact: "script",
    job: "generate_script",
    label: "Writing the narration",
    detail: "Turning each beat into clear words written for the ear.",
  },
  {
    artifact: "scene_visuals",
    job: "generate_scene_visuals",
    label: "Building the scenes",
    detail: "One editable animation per beat, timed to the narration you approved.",
  },
] as const;

export function ConnectedProcessing({ projectId, jobId }: { projectId: string; jobId: string }) {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const lastEventId = useRef<string | undefined>(undefined);
  const retryKey = useRef<{ runId: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    const nextStudio = await decodeApi.getStudio(projectId);
    setStudio(nextStudio);
    // The job detail we show failures/retries for is whichever stage is current,
    // not the one this route happened to open on.
    const currentJobId =
      nextStudio.active_job?.job_id ?? nextStudio.most_recent_job?.job_id ?? jobId;
    const nextJob = await decodeApi.getJob(projectId, currentJobId).catch(() => null);
    if (nextJob) setJob(nextJob);
    return nextStudio;
  }, [projectId, jobId]);

  useEffect(() => {
    let active = true;
    refresh().catch((cause: unknown) => {
      if (active) setError(creatorError(cause, "We couldn’t load this project’s progress."));
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  // Project-wide events refresh the snapshot; no per-job gating, because this is
  // the whole build rather than one stage.
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let failures = 0;
    const onEvent = (event: ProjectEvent) => {
      lastEventId.current = event.id || lastEventId.current;
      if (
        ["job.succeeded", "run.failed", "artifact.ready_for_review", "artifact.version.created"].includes(
          event.type,
        )
      ) {
        void refresh().catch(() => undefined);
      }
    };
    const connect = async () => {
      while (!stopped) {
        try {
          lastEventId.current = await streamProjectEvents({
            projectId,
            lastEventId: lastEventId.current,
            signal: controller.signal,
            onEvent,
          });
          failures += 1;
        } catch {
          if (controller.signal.aborted) return;
          failures += 1;
        }
        if (failures >= 3) await refresh().catch(() => undefined);
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(1000 * 2 ** failures, 10000)));
      }
    };
    void connect();
    const poll = window.setInterval(() => void refresh().catch(() => undefined), 4000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(poll);
    };
  }, [projectId, refresh]);

  const artifactTypes = useMemo(
    () => new Set((studio?.artifacts ?? []).map((item) => item.artifact_type)),
    [studio],
  );
  const activeJob = studio?.active_job ?? studio?.most_recent_job ?? null;
  const activeKind =
    activeJob && (activeJob.status === "running" || activeJob.status === "queued")
      ? activeJob.kind
      : null;
  const failed = activeJob?.status === "failed" || job?.status === "failed";
  const doneCount = PIPELINE.filter((stage) => artifactTypes.has(stage.artifact)).length;

  // The whole build lands in the cutting room the moment scenes exist. Voice
  // finishes in the background there (Edit polls it in, ADR-005).
  useEffect(() => {
    if (artifactTypes.has("scene_visuals")) {
      router.replace(`/studio/projects/${projectId}/edit`);
    }
  }, [artifactTypes, projectId, router]);

  const retry = async () => {
    const failedJobId = activeJob?.job_id ?? jobId;
    if (!job?.active_run_id || retrying) return;
    setRetrying(true);
    setError("");
    try {
      if (retryKey.current?.runId !== job.active_run_id) {
        retryKey.current = { runId: job.active_run_id, key: idempotencyKey() };
      }
      await decodeApi.retryJob(projectId, failedJobId, job.active_run_id, retryKey.current.key);
      retryKey.current = null;
      await refresh();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t try this step again. Please wait a moment."));
    } finally {
      setRetrying(false);
    }
  };

  const sourceCount = studio?.sources.length ?? 0;
  const progress = (doneCount / PIPELINE.length) * 100;
  const complete = doneCount >= PIPELINE.length;

  return (
    <AppShell active="none" connected>
      <main className="mx-auto grid min-h-dvh w-full max-w-[1200px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(280px,.72fr)_minmax(500px,1.28fr)] lg:items-center lg:gap-14 lg:px-8 lg:py-14">
        <section className="lg:sticky lg:top-10">
          <span className="studio-eyebrow">Building your video</span>
          <h1 className="mt-5 text-balance font-display text-[clamp(34px,4.8vw,58px)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">
            Turning your source into a video
          </h1>
          <p className="mt-4 max-w-[42ch] text-[13.5px] leading-[1.65] text-t6">
            Decode is building the whole production — brief, plan, narration and scenes — and opens the
            cutting room the moment the scenes are ready. You can leave this page; we’ll keep working.
          </p>
          <div className="studio-shell mt-8">
            <div className="studio-surface-muted p-4">
              <div className="text-[13px] font-medium text-ink">
                {studio?.project.title ?? "Loading project…"}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line-div pt-3">
                <Meta label="Sources" value={`${sourceCount} source${sourceCount === 1 ? "" : "s"}`} />
                <Meta
                  label="Status"
                  value={failed ? "Needs attention" : complete ? "Opening Edit" : "Building"}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="studio-shell">
          <div className="studio-surface overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line-div px-5 py-4">
              <AppMark gradient size={28} radius={8} font={13} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">Production progress</div>
                <div className="mt-0.5 truncate text-[10.5px] text-t8">
                  {studio?.project.title ?? "Your project"}
                </div>
              </div>
              <span className="font-mono text-[10px] text-t8 tabular-nums">
                {doneCount}/{PIPELINE.length}
              </span>
            </div>
            <div role="list" aria-live="polite" className="flex flex-col px-5 py-3">
              {PIPELINE.map((stage, index) => {
                const isDone = artifactTypes.has(stage.artifact);
                // Active = this stage's job is running, or (in the brief gap
                // between jobs) it is the next stage still to build.
                const isActive =
                  !isDone &&
                  !failed &&
                  (activeKind === stage.job || (activeKind === null && index === doneCount));
                return (
                  <div
                    key={stage.artifact}
                    role="listitem"
                    className={cx(
                      "grid grid-cols-[22px_minmax(0,1fr)] items-start gap-3 border-b border-line-div py-3 last:border-0",
                      !isDone && !isActive && "opacity-35",
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      {isDone ? (
                        <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-[10px] text-white">
                          ✓
                        </span>
                      ) : isActive ? (
                        <Spinner size={14} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                      )}
                    </span>
                    <div>
                      <div className="text-[13.5px] font-medium">{stage.label}</div>
                      {(isDone || isActive) && (
                        <div className="mt-0.5 text-[10.5px] text-t7">{stage.detail}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line-div bg-sunken px-5 py-4">
              <div className="h-[3px] overflow-hidden rounded-full bg-line-soft">
                <div
                  className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-[var(--t-normal)] ease-decode"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              </div>
              {error && <p role="alert" className="mt-3 text-[12px] text-[#8E2F19]">{error}</p>}
              <div className="mt-4 flex min-h-9 items-center justify-between gap-4">
                {failed ? (
                  <>
                    <p className="text-[12px] text-[#8E2F19]">
                      {job?.failure?.retryable
                        ? "A stage couldn’t finish."
                        : "A stage couldn’t finish. Your work is safe — please try again later."}
                    </p>
                    {job?.failure?.retryable && (
                      <Graphite
                        onClick={() => void retry()}
                        disabled={retrying}
                        className="px-4 py-2 text-[12.5px] font-medium"
                      >
                        {retrying ? "Trying again…" : "Try again"}
                      </Graphite>
                    )}
                  </>
                ) : complete ? (
                  <span className="flex items-center gap-2 text-[12px] text-t7">
                    <Spinner size={13} />
                    Opening the cutting room…
                  </span>
                ) : (
                  <p className="text-[12px] text-t7">You can leave this page. We’ll keep working.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8.5px] tracking-[0.1em] text-t9 uppercase">{label}</div>
      <div className="mt-1 truncate text-[11.5px] text-ink-2 capitalize">{value}</div>
    </div>
  );
}
