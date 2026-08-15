"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, TriangleAlert } from "lucide-react";
import { ConnectedProjectFrame } from "@/components/connected/ConnectedProjectFrame";
import { Edit } from "@/components/project/stages/Edit";
import { Graphite, Spinner, StageKicker, cx } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";
import { decodeApi, idempotencyKey, mediaUrl } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type {
  SceneVisualsPayload,
  Scene,
  ScriptPayload,
  StudioSnapshot,
  TeachingPlanPayload,
  VoicePayload,
} from "@/lib/types";

/**
 * Build the cut the Edit workspace already knows how to drive.
 *
 * Edit, Timeline, Inspector and the transport are all written against
 * `Scene[]` in the store, so a connected project earns the whole workspace by
 * producing that array rather than by growing a second one of everything.
 *
 * The three artifacts each own a different part of a scene and none of it is
 * invented here: the plan owns title, objective and duration, the script owns
 * narration, the Motion Designer owns the animation.
 */
function toScenes(
  plan: TeachingPlanPayload | null,
  script: ScriptPayload | null,
  visuals: SceneVisualsPayload | null,
  voice: VoicePayload | null,
): Scene[] {
  const narrationByBeat = new Map((script?.beats ?? []).map((b) => [b.beat_id, b.narration]));
  const moduleByBeat = new Map((visuals?.scenes ?? []).map((s) => [s.beat_id, s]));
  const voiceByBeat = new Map((voice?.clips ?? []).map((c) => [c.beat_id, c]));

  // A beat without an id cannot be matched to its narration or its module, so
  // it is not a scene — the same guard the Script stage uses.
  return (plan?.beats ?? []).flatMap<Scene>((beat) => {
    if (!beat.id) return [];
    const sceneModule = moduleByBeat.get(beat.id);
    const clip = voiceByBeat.get(beat.id);
    return [{
      id: beat.id,
      title: beat.title ?? "Untitled scene",
      // Audio is the timing authority (ADR-005): once narration exists, the
      // scene is as long as its measured clip, so the visual stays locked to the
      // voice. The plan's target is only the estimate used before voice lands.
      dur: clip?.duration_seconds ?? beat.target_duration_seconds ?? 0,
      // The prototype's animation labels are a fixed vocabulary describing
      // stand-in visuals. A real module is not one of them, and naming one
      // would be a claim about generated code nobody checked.
      anim: "Fade sequence",
      reason: beat.visual_opportunity ?? visuals?.rationale ?? "",
      objective: beat.objective ?? "",
      caption: beat.title,
      prompt: beat.visual_opportunity ?? "",
      // `viz` and `hot` drive the chip stand-in, which a connected scene never
      // renders — it has the real animation. Key points keep them meaningful
      // anywhere else that reads them.
      viz: beat.key_points ?? [],
      hot: 0,
      narration: narrationByBeat.get(beat.id) ?? "",
      // No alternate draft: a second version here would be one this project's
      // Writer never wrote.
      alt: "",
      altUsed: false,
      componentSource: sceneModule?.component_source,
      controls: sceneModule?.controls,
      audioUrl: clip ? mediaUrl(clip.audio_key) : undefined,
    }];
  });
}

export function ConnectedEdit({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSnapshot | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [visualsVersionId, setVisualsVersionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "done" | "failed">("idle");
  const [renderId, setRenderId] = useState<string | null>(null);
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

    const find = (type: string) =>
      nextStudio.artifacts.find((item) => item.artifact_type === type);
    const planArtifact = find("teaching_plan");
    const scriptArtifact = find("script");
    const visualsArtifact = find("scene_visuals");
    const voiceArtifact = find("voice");

    setArtifactId(visualsArtifact?.artifact_id ?? null);
    if (!visualsArtifact) {
      setReady(false);
      return;
    }

    // The approved plan and script, not the newest: the Motion Designer built
    // against those, and pairing its scenes with a later draft would show a cut
    // that was never made.
    const [planResult, scriptResult, visualsResult, voiceResult] = await Promise.all([
      planArtifact
        ? decodeApi.getTeachingPlan(projectId, planArtifact.artifact_id)
        : Promise.resolve(null),
      scriptArtifact
        ? decodeApi.getScript(projectId, scriptArtifact.artifact_id)
        : Promise.resolve(null),
      decodeApi.getSceneVisuals(projectId, visualsArtifact.artifact_id),
      voiceArtifact
        ? decodeApi.getVoice(projectId, voiceArtifact.artifact_id)
        : Promise.resolve(null),
    ]);

    const approvedOf = <T,>(
      result: { items: { version_id: string; payload: T }[]; approved_version_id: string | null } | null,
    ) =>
      result
        ? (result.items.find((item) => item.version_id === result.approved_version_id) ??
            result.items[0])?.payload ?? null
        : null;

    const visualsVersion =
      visualsResult.items.find((item) => item.version_id === visualsResult.latest_version_id) ??
      visualsResult.items[0];
    // The cut the creator is editing — the version a per-scene direction is
    // written against, so a stale one is refused rather than redrawn.
    setVisualsVersionId(visualsVersion?.version_id ?? null);
    const voiceVersion =
      voiceResult?.items.find((item) => item.version_id === voiceResult.latest_version_id) ??
      voiceResult?.items[0];
    // Hydrating the store rather than passing props, because that is where the
    // workspace reads from. Approvals come along so the Edit stage is not gated
    // shut against a project the backend has already approved.
    useStudio.setState({
      sc: toScenes(
        approvedOf(planResult),
        approvedOf(scriptResult),
        visualsVersion?.payload ?? null,
        voiceVersion?.payload ?? null,
      ),
      sceneIdx: 0,
      playhead: 0,
      playing: false,
      playbackRate: 0,
      visualPick: {},
      staleByScene: {},
      _history: [],
      _future: [],
      regen: null,
    });
    setReady(true);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    setError("");
    load()
      .catch((cause: unknown) => {
        if (active) setError(creatorError(cause, "We couldn’t load these scenes."));
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const visualsJob = [studio?.active_job, studio?.most_recent_job].find(
    (job) => job?.kind === "generate_scene_visuals" && job.status !== "succeeded",
  );
  const visualsRunning = visualsJob?.status === "queued" || visualsJob?.status === "running";

  useEffect(() => {
    if (!visualsRunning || ready) return;
    const poll = window.setInterval(() => {
      void load().catch((cause: unknown) => {
        setError(creatorError(cause, "We couldn’t refresh the Motion Designer’s progress."));
      });
    }, 1500);
    return () => window.clearInterval(poll);
  }, [load, visualsRunning, ready]);

  const startVisuals = async () => {
    const scriptArtifact = studio?.artifacts.find((item) => item.artifact_type === "script");
    if (!scriptArtifact?.approved_version_id || busy) return;
    const existing = studio?.active_job ?? studio?.most_recent_job;
    if (existing?.kind === "generate_scene_visuals" && existing.status !== "succeeded") {
      if (existing.status === "failed") {
        router.push(`/studio/projects/${projectId}/jobs/${existing.job_id}`);
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const informedBy = await decodeApi.getLineage(
        projectId,
        scriptArtifact.artifact_id,
        scriptArtifact.approved_version_id,
      );
      const intent = informedBy.parents.find(
        (parent) => parent.artifact_type === "production_intent",
      );
      if (!intent) throw new Error("The production direction for this script is unavailable.");
      const fingerprint = `generate-scene-visuals:${scriptArtifact.approved_version_id}:${intent.version_id}`;
      await decodeApi.generateSceneVisuals(
        projectId,
        scriptArtifact.approved_version_id,
        intent.version_id,
        keyFor(fingerprint),
      );
      commandKeys.current.delete(fingerprint);
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t start the scenes."));
    } finally {
      setBusy(false);
    }
  };

  const voiceJob = [studio?.active_job, studio?.most_recent_job].find(
    (job) => job?.kind === "generate_voice" && job.status !== "succeeded",
  );
  const voiceRunning = voiceJob?.status === "queued" || voiceJob?.status === "running";

  useEffect(() => {
    if (!voiceRunning) return;
    const poll = window.setInterval(() => {
      void load().catch((cause: unknown) => {
        setError(creatorError(cause, "We couldn’t refresh the Narrator’s progress."));
      });
    }, 1500);
    return () => window.clearInterval(poll);
  }, [load, voiceRunning]);

  const startVoice = async () => {
    const scriptArtifact = studio?.artifacts.find((item) => item.artifact_type === "script");
    if (!scriptArtifact?.approved_version_id || busy) return;
    setBusy(true);
    setError("");
    try {
      const informedBy = await decodeApi.getLineage(
        projectId,
        scriptArtifact.artifact_id,
        scriptArtifact.approved_version_id,
      );
      const intent = informedBy.parents.find(
        (parent) => parent.artifact_type === "production_intent",
      );
      if (!intent) throw new Error("The production direction for this script is unavailable.");
      const fingerprint = `generate-voice:${scriptArtifact.approved_version_id}:${intent.version_id}`;
      await decodeApi.generateVoice(
        projectId,
        scriptArtifact.approved_version_id,
        intent.version_id,
        keyFor(fingerprint),
      );
      commandKeys.current.delete(fingerprint);
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t record the narration."));
    } finally {
      setBusy(false);
    }
  };

  const hasVoice = studio?.artifacts.some((item) => item.artifact_type === "voice");

  const scriptApproved = studio?.artifacts.some(
    (item) => item.artifact_type === "script" && item.approved_version_id,
  );

  // The per-scene direction loop, wired to the backend. The creator directs one
  // scene in words; only that scene is redrawn, and the receipt says so. Guarded
  // by the store's `regen` line so a second direction can't overlap the first.
  const directScene = useCallback(
    async (beatId: string, direction: string) => {
      const store = useStudio.getState();
      if (!visualsVersionId || store.regen) return;
      store.setRegen("Redrawing this scene to your direction…");
      try {
        const { job_id } = await decodeApi.regenerateSceneVisual(
          projectId,
          visualsVersionId,
          beatId,
          direction,
          idempotencyKey(),
        );
        // Bounded poll — a job that never resolves must not leave the inspector
        // locked in "Redrawing…" forever. ~3 minutes, then fail safe.
        for (let attempt = 0; ; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
          const job = await decodeApi.getJob(projectId, job_id);
          if (job.status === "succeeded") break;
          if (job.status === "failed") throw new Error("regenerate_failed");
          if (attempt >= 120) throw new Error("regenerate_timeout");
        }
        // Respect whatever scene the creator selected while the redraw ran; only
        // fall back to where they started if they never moved.
        const liveIdx = useStudio.getState().sceneIdx;
        await load();
        useStudio.setState({ sceneIdx: liveIdx });
        useStudio
          .getState()
          .say(
            "I redrew this scene to your direction and left every other scene as it was.",
            "1 scene redrawn",
          );
      } catch {
        useStudio
          .getState()
          .say("I couldn’t redraw that scene. Nothing changed — your other scenes are safe.");
      } finally {
        useStudio.getState().setRegen(null);
      }
    },
    [projectId, visualsVersionId, load],
  );

  const startExport = async () => {
    if (!ready || renderState === "rendering") return;
    setRenderState("rendering");
    setError("");
    const sc = useStudio.getState().sc;
    const visualPick = useStudio.getState().visualPick;
    try {
      const result = await decodeApi.startRender(
        projectId,
        sc.map((scene) => {
          const { componentSource, controls, ...rest } = scene;
          void componentSource;
          void controls;
          return rest;
        }),
        visualPick,
        idempotencyKey(),
      );
      setRenderId(result.render_id);
    } catch (cause) {
      setRenderState("failed");
      setError(creatorError(cause, "Export failed. Please try again."));
    }
  };

  useEffect(() => {
    if (renderState !== "rendering" || !renderId) return;
    let active = true;
    const poll = window.setInterval(() => {
      decodeApi.getRender(renderId)
        .then((result) => {
          if (!active) return;
          if (result.status === "done") {
            window.clearInterval(poll);
            setRenderState("done");
            if (result.download_path) window.open(result.download_path, "_blank");
          } else if (result.status === "failed") {
            window.clearInterval(poll);
            setRenderState("failed");
            setError(result.error || "Export failed.");
          }
        })
        .catch((cause: unknown) => {
          if (!active) return;
          window.clearInterval(poll);
          setRenderState("failed");
          setError(creatorError(cause, "Export failed. Please try again."));
        });
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [renderId, renderState]);
  return (
    <ConnectedProjectFrame
      projectId={projectId}
      studio={studio}
      activeStage="edit"
      statusLabel={`Edit · ${initialLoading ? "loading" : ready ? "saved" : "not started"}`}
      loading={initialLoading}
      fill={ready}
      onExport={startExport}
    >
      {!ready ? (
        // The cutting room is dark before any of this data exists, so the
        // interim states — loading, in progress, failed, not-started —
        // inherit that rather than showing a light card on a dark shell.
        <div className="min-h-full bg-[var(--nle-bg)] text-[var(--nle-text)]">
        {initialLoading ? (
          <EditSkeleton />
        ) : visualsRunning ? (
          <VisualsInProgress />
        ) : visualsJob?.status === "failed" ? (
          <EditFailure
            message="The Motion Designer couldn’t finish these scenes. Your approved script is safe."
            onRetry={() => router.push(`/studio/projects/${projectId}/jobs/${visualsJob.job_id}`)}
            actionLabel="Open recovery"
          />
        ) : error && (!studio || artifactId) ? (
          <EditFailure message={error} onRetry={() => void load()} />
        ) : (
          <main className="mx-auto w-full max-w-[920px] p-4 sm:p-6 lg:p-8">
            <div className="rounded-[20px] border border-[var(--nle-line)] bg-[var(--nle-panel)] p-6 sm:p-8">
              <StageKicker className="text-[var(--nle-muted)]">Edit</StageKicker>
              <h1 className="mt-4 font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1] tracking-[-0.04em] text-[var(--nle-text)]">
                {scriptApproved
                  ? "The Motion Designer is ready when you are"
                  : "Approve the Script first"}
              </h1>
              <p className="mt-4 max-w-[62ch] text-[13.5px] leading-[1.7] text-[var(--nle-muted)]">
                  {scriptApproved
                    ? "Your approved script is safe. The Motion Designer builds an animation for each beat, timed to the seconds you already signed off on."
                    : "The Motion Designer works from the Script you approved — each passage becomes the scene a viewer watches while they hear it."}
                </p>
                <Graphite
                  onClick={() =>
                    scriptApproved
                      ? void startVisuals()
                      : router.push(`/studio/projects/${projectId}/script`)
                  }
                  disabled={busy}
                  className="mt-6 px-5 py-2.5 text-[13px] font-medium"
                >
                  {scriptApproved
                    ? busy
                      ? "Starting the Motion Designer…"
                      : "Build the scenes"
                    : "Review Script"}
                </Graphite>
              {error && <p role="alert" className="mt-4 text-[12px] text-[#8E2F19]">{error}</p>}
            </div>
          </main>
        )}
        </div>
       ) : (
        <div className="min-h-0 lg:h-full">
          <Edit
            onDirectScene={directScene}
            onEditNarration={() => router.push(`/studio/projects/${projectId}/script`)}
          />
          {(!hasVoice || renderState !== "idle") && (
            <div className="flex flex-none items-center gap-2 border-t border-[var(--nle-line)] bg-[var(--nle-panel)] px-4 py-2">
              {!hasVoice && (
                <button
                  type="button"
                  onClick={() => void startVoice()}
                  disabled={busy || voiceRunning}
                  className="text-[11.5px] font-medium text-[var(--nle-muted)] transition-colors hover:text-[var(--nle-text)] disabled:opacity-50"
                >
                  {voiceRunning ? "Recording narration…" : "Generate voice"}
                </button>
              )}
              {renderState !== "idle" && (
                <>
                  <span className="text-[11.5px] text-[var(--nle-muted)]">
                    {renderState === "rendering" ? "Exporting your video…" : renderState === "done" ? "Export ready" : "Export failed"}
                  </span>
                  {renderState === "failed" && (
                    <button onClick={startExport} className="ml-auto text-[11.5px] font-medium text-[var(--accent-lit)] hover:text-[var(--accent)]">Retry</button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </ConnectedProjectFrame>
  );
}

function EditSkeleton() {
  return (
    <main
      aria-live="polite"
      aria-busy="true"
      className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <span className="sr-only">Loading the scenes, their timings and approval state.</span>
      <div className="rounded-[20px] border border-[var(--nle-line)] bg-[var(--nle-panel)] p-6">
        <div className="h-3 w-24 rounded-full bg-[var(--nle-panel-raised)]" />
        <div className="mt-4 h-9 w-1/2 rounded-xl bg-[var(--nle-panel-raised)]" />
        <div className="mt-5 aspect-video w-full rounded-2xl bg-[var(--nle-panel-raised)]" />
      </div>
    </main>
  );
}

function VisualsInProgress() {
  return (
    <main aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8">
      <section className="rounded-[20px] border border-[var(--nle-line)] bg-[var(--nle-panel)] p-6 sm:p-8">
        <StageKicker className="text-[var(--nle-muted)]">Motion Designer at work</StageKicker>
        <h1 className="mt-4 font-display text-[clamp(30px,4vw,46px)] font-semibold leading-none tracking-[-0.04em] text-[var(--nle-text)]">
          Building the scenes
        </h1>
        <p className="mt-4 max-w-[62ch] text-[13.5px] leading-[1.7] text-[var(--nle-muted)]">
          The Motion Designer is turning each approved passage into an animation. You can move
          elsewhere in the project while this continues.
        </p>

        <div className="mt-7 overflow-hidden rounded-[16px] border border-[var(--nle-line)] bg-[var(--nle-bg)]">
          <ProgressRow
            state="done"
            title="Script received"
            detail="The approved narration and its beat timings are the brief."
          />
          <ProgressRow
            state="active"
            title="Writing and checking each scene"
            detail="Building an animation per beat, then checking it only uses what Decode allows."
          />
          <ProgressRow
            state="pending"
            title="Ready for your review"
            detail="The finished scenes will play here."
          />
        </div>
      </section>
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
        "grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-[var(--nle-line)] px-4 py-3.5 last:border-0",
        state === "pending" && "opacity-45",
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        {state === "done" ? (
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--nle-text)] text-[10px] text-[var(--nle-bg)]">
            ✓
          </span>
        ) : state === "active" ? (
          <Spinner size={14} track="#3A3A3A" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--nle-line-strong)]" />
        )}
      </span>
      <span>
        <span className="block text-[13.5px] font-medium text-[var(--nle-text)]">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-[var(--nle-muted)]">{detail}</span>
      </span>
    </div>
  );
}

function EditFailure({
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
      <div role="alert" className="rounded-[20px] border border-[var(--nle-line)] bg-[var(--nle-panel)] p-6 sm:p-8">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--nle-panel-raised)] text-accent-deep">
          <TriangleAlert size={17} />
        </span>
        <StageKicker className="mt-5 text-[var(--nle-muted)]">Edit</StageKicker>
        <h1 className="mt-3 font-display text-[clamp(26px,4vw,40px)] font-semibold tracking-[-0.035em] text-[var(--nle-text)]">
          The scenes didn’t open
        </h1>
        <p className="mt-3 max-w-[58ch] text-[13px] leading-[1.65] text-[var(--nle-muted)]">{message}</p>
        <Graphite onClick={onRetry} className="mt-6 flex min-h-10 items-center gap-2 px-4 text-[12.5px] font-medium">
          <RotateCw size={13} />
          {actionLabel}
        </Graphite>
      </div>
    </main>
  );
}
