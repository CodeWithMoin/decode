"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppMark, Graphite, Spinner, cx } from "@/components/ui/primitives";
import { decodeApi, idempotencyKey, streamProjectEvents } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type { JobDetail, ProjectEvent, StudioSnapshot } from "@/lib/types";

const STEPS = [
  { events: ["job.queued"], label: "Source received", detail: "Your material is ready." },
  { events: ["run.started"], label: "Preparing your project", detail: "Bringing together your source details and creative direction." },
  { events: ["reading_sources"], label: "Confirming your source", detail: "Making sure your upload is available for this project." },
  { events: ["generating_brief"], label: "Creating a sample production brief", detail: "Using your audience and direction to shape a reviewable draft." },
  { events: ["evaluating_brief"], label: "Checking the brief", detail: "Making sure learning goals and key ideas are present." },
  { events: ["artifact.version.created"], label: "Saving your draft", detail: "Preparing it for your review." },
  { events: ["artifact.ready_for_review", "job.succeeded"], label: "Ready for your review", detail: "Your sample production brief is ready." },
] as const;

export function ConnectedProcessing({ projectId, jobId }: { projectId: string; jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const lastEventId = useRef<string | undefined>(undefined);
  const retryKey = useRef<{ runId: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    const [nextJob, nextStudio] = await Promise.all([
      decodeApi.getJob(projectId, jobId),
      decodeApi.getStudio(projectId),
    ]);
    setJob(nextJob);
    setStudio(nextStudio);
    return nextJob;
  }, [jobId, projectId]);

  useEffect(() => {
    let active = true;
    refresh().catch((cause: unknown) => {
      if (active) setError(creatorError(cause, "We couldn’t load this project’s progress."));
    });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let failures = 0;

    const onEvent = (event: ProjectEvent) => {
      lastEventId.current = event.id || lastEventId.current;
      // The stream is project-wide and replays old jobs. Advance the durable
      // cursor, but never let another job mutate this job's progress UI.
      if (event.job_id !== jobId) return;
      const progressStep = typeof event.data.step === "string" ? event.data.step : event.data.stage;
      const marker = event.type === "run.progress" && typeof progressStep === "string"
        ? progressStep
        : event.type;
      setSeen((current) => current.includes(marker) ? current : [...current, marker]);
      if (["job.succeeded", "run.failed", "artifact.ready_for_review"].includes(event.type)) {
        void refresh();
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
        if (failures >= 3) {
          await refresh().catch(() => undefined);
        }
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(1000 * 2 ** failures, 10000)));
      }
    };
    void connect();
    const poll = window.setInterval(() => {
      if (failures >= 3) void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(poll);
    };
  }, [jobId, projectId, refresh]);

  const completedIndex = useMemo(() => {
    if (job?.status === "succeeded") return STEPS.length;
    let furthest = job?.status === "running" ? 1 : 0;
    STEPS.forEach((step, index) => {
      if (step.events.some((event) => seen.includes(event))) furthest = Math.max(furthest, index + 1);
    });
    return furthest;
  }, [job?.status, seen]);

  const retry = async () => {
    if (!job?.active_run_id || retrying) return;
    setRetrying(true);
    setError("");
    try {
      if (retryKey.current?.runId !== job.active_run_id) {
        retryKey.current = { runId: job.active_run_id, key: idempotencyKey() };
      }
      await decodeApi.retryJob(projectId, jobId, job.active_run_id, retryKey.current.key);
      retryKey.current = null;
      await refresh();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t try this step again. Please wait a moment."));
    } finally {
      setRetrying(false);
    }
  };

  const sourceCount = studio?.sources.length ?? 0;
  const progress = (completedIndex / STEPS.length) * 100;
  const terminal = job?.status === "succeeded" || job?.status === "failed";
  const status = job?.status === "succeeded"
    ? "Ready to review"
    : job?.status === "failed"
      ? "Needs attention"
      : job
        ? "In progress"
        : "Starting";

  return (
    <AppShell active="none" connected>
      <main className="mx-auto grid min-h-dvh w-full max-w-[1200px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(280px,.72fr)_minmax(500px,1.28fr)] lg:items-center lg:gap-14 lg:px-8 lg:py-14">
        <section className="lg:sticky lg:top-10">
          <span className="studio-eyebrow">Preparing your project</span>
          <h1 className="mt-5 text-balance font-display text-[clamp(34px,4.8vw,58px)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">
            Creating a sample production brief
          </h1>
          <p className="mt-4 max-w-[42ch] text-[13.5px] leading-[1.65] text-t6">
            This preview uses your production choices to show how review and approval work. Source analysis comes next. You can leave this page—we’ll keep working.
          </p>
          <div className="studio-shell mt-8">
            <div className="studio-surface-muted p-4">
            <div className="text-[13px] font-medium text-ink">{studio?.project.title ?? "Loading project…"}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line-div pt-3">
              <Meta label="Sources" value={`${sourceCount} source${sourceCount === 1 ? "" : "s"}`} />
              <Meta label="Status" value={status} />
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
              <div className="mt-0.5 truncate text-[10.5px] text-t8">{studio?.project.title ?? "Your project"}</div>
            </div>
            <span className="font-mono text-[10px] text-t8 tabular-nums">{completedIndex}/{STEPS.length}</span>
          </div>
          <div role="list" aria-live="polite" className="flex flex-col px-5 py-3">
            {STEPS.map((step, index) => {
              const done = index < completedIndex;
              const active = index === completedIndex && !terminal;
              return (
                <div key={step.label} role="listitem" className={cx("grid grid-cols-[22px_minmax(0,1fr)] items-start gap-3 border-b border-line-div py-3 last:border-0", !done && !active && "opacity-35")}>
                  <span className="flex h-5 w-5 items-center justify-center">
                    {done ? <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-[10px] text-white">✓</span> : active ? <Spinner size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
                  </span>
                  <div><div className="text-[13.5px] font-medium">{step.label}</div>{(done || active) && <div className="mt-0.5 text-[10.5px] text-t7">{step.detail}</div>}</div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-line-div bg-sunken px-5 py-4">
            <div className="h-[3px] overflow-hidden rounded-full bg-line-soft"><div className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-[var(--t-normal)] ease-decode" style={{ transform: `scaleX(${progress / 100})` }} /></div>
            {error && <p role="alert" className="mt-3 text-[12px] text-[#8E2F19]">{error}</p>}
            <div className="mt-4 flex min-h-9 items-center justify-between gap-4">
              {job?.status === "succeeded" ? <><p className="text-[12px] text-t6">Your sample production brief is ready.</p><Graphite onClick={() => router.push(`/studio/projects/${projectId}/understanding`)} className="px-4 py-2 text-[12.5px] font-medium">Review production brief →</Graphite></> : job?.status === "failed" ? <><p className="text-[12px] text-[#8E2F19]">{job.failure?.retryable ? "We couldn’t finish your production brief." : "We couldn’t finish your production brief right now. Your work is safe—please try again later."}</p>{job.failure?.retryable && <Graphite onClick={() => void retry()} disabled={retrying} className="px-4 py-2 text-[12.5px] font-medium">{retrying ? "Trying again…" : "Try again"}</Graphite>}</> : <p className="text-[12px] text-t7">You can leave this page. We’ll keep working.</p>}
            </div>
          </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="font-mono text-[8.5px] tracking-[0.1em] text-t9 uppercase">{label}</div><div className="mt-1 truncate text-[11.5px] text-ink-2 capitalize">{value}</div></div>;
}
