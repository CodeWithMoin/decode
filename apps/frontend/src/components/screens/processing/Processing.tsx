"use client";

/**
 * The entry flow's last stop before a project exists.
 *
 * The spec's hard invariant: never a bare spinner, never "Generating…". This
 * is a Cursor-style named indexing checklist — each row states what it did,
 * quoting the brief the user actually set (audience, runtime, beat count),
 * so the wait reads as work happening rather than a black box.
 *
 * `processingSteps` is a function of that brief, so this component owns
 * building its `ctx` from the store rather than hardcoding the seed values.
 */

import { useEffect, useMemo, useRef } from "react";
import { PROCESSING_GAPS, processingSteps } from "@/lib/api";
import { scriptWordCount } from "@/lib/derive";
import {
  AppMark,
  Graphite,
  Spinner,
  StageKicker,
  cx,
} from "@/components/ui/primitives";
import { AppShell } from "@/components/app/AppShell";
import { useStudio } from "@/store/studio";

export function Processing() {
  const sources = useStudio((s) => s.sources);
  const source = useStudio((s) => s.source);
  const sc = useStudio((s) => s.sc);
  const runtime = useStudio((s) => s.runtime);
  const audience = useStudio((s) => s.audience);
  const pstep = useStudio((s) => s.pstep);
  const setPstep = useStudio((s) => s.setPstep);
  const go = useStudio((s) => s.go);

  // The checklist reads the first source; the rest are counted beside it.
  const src = sources[0] ?? source;

  const steps = useMemo(
    () =>
      processingSteps({
        sourceMeta: src.meta,
        beats: sc.length,
        runtime,
        audience,
        scriptWords: scriptWordCount(sc),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx snapshot at mount; the checklist shouldn't reshuffle mid-run
    [],
  );

  const stepsRef = useRef(steps.length);
  stepsRef.current = steps.length;

  useEffect(() => {
    setPstep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < PROCESSING_GAPS.length; i += 1) {
      elapsed += PROCESSING_GAPS[i];
      const stepIndex = i + 1;
      timers.push(
        setTimeout(() => {
          if (stepIndex <= stepsRef.current) setPstep(stepIndex);
        }, elapsed),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPstep is a stable zustand action
  }, []);

  const done = pstep >= steps.length;
  const progressPct = (Math.min(pstep, steps.length) / steps.length) * 100;

  return (
    <AppShell active="none">
      <main className="mx-auto grid min-h-dvh w-full max-w-[980px] gap-8 px-6 py-10 sm:px-8 lg:grid-cols-[minmax(260px,0.72fr)_minmax(480px,1.28fr)] lg:items-center lg:gap-12 lg:py-14">
        <section className="lg:sticky lg:top-10">
          <StageKicker>Preparing production</StageKicker>
          <h1 className="mt-3 text-balance font-display text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.04] tracking-[-0.03em] text-ink">
            The crew is reading before it starts making.
          </h1>
          <p className="mt-4 max-w-[42ch] text-[13.5px] leading-[1.65] text-t6">
            You’ll review the understanding, teaching plan, and script before
            Decode renders a single frame.
          </p>

          <div className="mt-7 rounded-[16px] border border-line-input bg-card p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex-none rounded-[5px] border border-line-soft bg-sunken px-1.5 py-[3px] font-mono text-[8.5px] tracking-[0.08em] text-t6">
                {src.ext}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {src.title}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line-div pt-3">
              <ProcessingMeta label="Sources" value={`${sources.length || 1}`} />
              <ProcessingMeta label="Audience" value={audience || "Not specified"} />
              <ProcessingMeta label="Target" value={runtime} />
              <ProcessingMeta label="Scenes" value={`${sc.length}`} />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-line bg-card shadow-lg">
          <div className="flex items-center gap-3 border-b border-line-div px-5 py-4">
            <AppMark gradient size={28} radius={8} font={13} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">Decode call sheet</div>
              <div className="mt-0.5 truncate text-[10.5px] text-t8">{src.file} · {src.meta}</div>
            </div>
            <span className="font-mono text-[10px] text-t8 tabular-nums">
              {Math.min(pstep, steps.length)}/{steps.length}
            </span>
          </div>

          <div
            role="list"
            aria-live="polite"
            aria-atomic="false"
            className="flex flex-col px-5 py-3"
          >
            {steps.map((step, i) => {
              const isDone = i < pstep;
              const isActive = i === pstep && !done;
              return (
                <div
                  key={step.label}
                  role="listitem"
                  className={cx(
                    "grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-3 border-b border-line-div py-3 last:border-b-0 transition-opacity duration-[var(--t-fast)] ease-decode",
                    !isDone && !isActive && "opacity-35",
                  )}
                >
                  <span className="flex h-[20px] w-[20px] items-center justify-center">
                    {isDone ? (
                      <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-[10px] text-white">
                        ✓
                      </span>
                    ) : isActive ? (
                      <Spinner size={14} />
                    ) : (
                      <span className="block h-[6px] w-[6px] rounded-full bg-line-strong" />
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink">
                      {step.label}
                    </div>
                    {(isDone || isActive) && (
                      <div className="mt-0.5 truncate font-mono text-[10.5px] text-t7">
                        {isDone ? step.detail : "Working from the approved brief…"}
                      </div>
                    )}
                  </div>

                  {isDone && (
                    <span className="pt-0.5 font-mono text-[10px] text-t8">
                      {step.time}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-line-div bg-sunken px-5 py-4">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-line-soft">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-[var(--t-normal)] ease-decode"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-4 flex min-h-9 items-center justify-between gap-4">
              {done ? (
                <>
                  <p className="text-[12px] text-t6">Production brief ready for review.</p>
                  <Graphite
                    onClick={() => go("project")}
                    className="px-4 py-2 text-[12.5px] font-medium"
                  >
                    Open project →
                  </Graphite>
                </>
              ) : (
                <p className="text-[12px] text-t7">
                  Nothing is rendering yet. This is analysis and planning only.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function ProcessingMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8.5px] tracking-[0.1em] text-t9 uppercase">{label}</div>
      <div className="mt-1 truncate text-[11.5px] text-ink-2">{value}</div>
    </div>
  );
}
