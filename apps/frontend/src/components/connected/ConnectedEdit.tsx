"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, TriangleAlert } from "lucide-react";
import { ConnectedProjectFrame } from "@/components/connected/ConnectedProjectFrame";
import { Edit } from "@/components/project/stages/Edit";
import { Graphite, Spinner, StageKicker, cx } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";
import {
  decodeApi,
  DecodeApiError,
  idempotencyKey,
  mediaUrl,
  streamProjectEvents,
} from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type {
  BuildOptions,
  SceneVisualsPayload,
  Scene,
  SceneCandidate,
  ProjectEvent,
  ScriptPayload,
  StudioSnapshot,
  TeachingPlanPayload,
  ThreadMessage,
  VoicePayload,
} from "@/lib/types";

/**
 * The room's conversation, kept per project in this browser. The store is
 * in-memory only, so without this every reload wiped the chat — and the durable
 * event stream can't rebuild it: the creator's own messages never become events.
 * ponytail: localStorage, this-browser-only; move to a backend thread record if
 * history must follow the creator across devices.
 */
const threadKey = (projectId: string) => `decode:thread:${projectId}`;

function loadThread(projectId: string): ThreadMessage[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(threadKey(projectId)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as ThreadMessage[]) : [];
  } catch {
    return [];
  }
}

function saveThread(projectId: string, thread: ThreadMessage[]) {
  // Streaming bubbles settle before saving; an empty one leaves no residue.
  const settled = thread
    .filter((m) => m.text.trim())
    .map(({ streaming: _streaming, ...m }) => m)
    .slice(-200);
  try {
    localStorage.setItem(threadKey(projectId), JSON.stringify(settled));
  } catch {
    // Full or blocked storage loses history, never the session.
  }
}

/**
 * The chat shows the work, not a status ping. When a stage lands, post what was
 * actually decided — the brief's framing, the plan's scenes, the script's
 * opening lines — so the creator reads the production instead of a progress bar.
 * Failures fall back silently; the terse eventMessage line still covers them.
 */
async function saySubstance(projectId: string, event: ProjectEvent): Promise<boolean> {
  const say = (text: string, kicker: string) =>
    useStudio.getState().say(text, undefined, kicker);
  const artifact = String(event.data.artifact_type ?? "");
  try {
    if (event.type === "production.scene.candidate.ready") {
      const beatId = String(event.data.beat_id ?? "");
      const title = useStudio.getState().sc.find((s) => s.id === beatId)?.title;
      // A per-scene tick, not speech: seven of these in a row are a progress
      // readout, so they render as quiet status lines. No kicker — the line
      // already says what it is.
      useStudio
        .getState()
        .say(title ? `Drafted “${title}”` : "Drafted a scene", undefined, undefined, true);
      return true;
    }
    if (event.type !== "artifact.ready_for_review") return false;
    if (artifact === "scene_visuals") {
      // The Motion Designer already explained its own cut — post its words,
      // not a canned line. The terse fallback still covers a fetch failure.
      const studio = await decodeApi.getStudio(projectId);
      const ref = studio.artifacts.find((a) => a.artifact_type === "scene_visuals");
      if (!ref) return false;
      const versions = await decodeApi.getSceneVisuals(projectId, ref.artifact_id);
      const rationale = versions.items[0]?.payload?.rationale?.trim();
      if (!rationale) return false;
      say(rationale, "The cut");
      return true;
    }
    if (artifact === "production_brief") {
      const brief = (await decodeApi.getBrief(projectId)).latest_version.payload;
      const parts = [
        brief.title ? `“${brief.title}”` : null,
        brief.audience_profile ? `for ${brief.audience_profile}` : null,
      ].filter(Boolean);
      say(
        `Here's what we're making — ${parts.join(", ")}. ${brief.summary ?? ""}`.trim(),
        "The brief",
      );
      return true;
    }
    if (artifact === "teaching_plan" || artifact === "script") {
      const studio = await decodeApi.getStudio(projectId);
      const ref = studio.artifacts.find((a) => a.artifact_type === artifact);
      if (!ref) return false;
      if (artifact === "teaching_plan") {
        const versions = await decodeApi.getTeachingPlan(projectId, ref.artifact_id);
        const plan = versions.items[0]?.payload;
        if (!plan) return false;
        const lines = plan.beats.map(
          (b, i) => `${i + 1}. ${b.title}${b.target_duration_seconds ? ` — ${b.target_duration_seconds}s` : ""}`,
        );
        say(
          `Here's the lesson I'm going with — ${plan.beats.length} scenes:\n${lines.join("\n")}\n\nThrough-line: ${plan.through_line}`,
          "Teaching plan",
        );
      } else {
        const versions = await decodeApi.getScript(projectId, ref.artifact_id);
        const script = versions.items[0]?.payload;
        if (!script) return false;
        const opener = (text: string) => {
          const words = text.split(/\s+/);
          return words.slice(0, 14).join(" ") + (words.length > 14 ? "…" : "");
        };
        const lines = script.beats.map((b, i) => `${i + 1}. “${opener(b.narration)}”`);
        say(
          `The narration is written — each scene opens like this:\n${lines.join("\n")}`,
          "The script",
        );
      }
      return true;
    }
  } catch {
    return false; // the terse fallback line still posts
  }
  return false;
}

function eventMessage(event: ProjectEvent): string | null {
  const data = event.data;
  // run.progress was the pre-generation "I'm reading/ordering…" chatter. The
  // agent now streams its actual reasoning live (like Claude Code), so that
  // status line is redundant — drop it and let the stream speak, keeping only
  // the terse completion markers below.
  if (event.type === "run.progress") return null;
  if (event.type === "production.graph.started") {
    const count = Number(data.scene_count ?? 0);
    return `Building ${count} scene${count === 1 ? "" : "s"} in parallel`;
  }
  if (event.type === "production.scene.candidate.ready") {
    // Named in onEvent with the scene's title; this is only the fallback.
    return null;
  }
  if (event.type === "production.scene.candidate.accepted") {
    return "Scene accepted — every other candidate unchanged";
  }
  if (event.type === "production.chain.decided") {
    // The conductor's own words on why this step is next — model-authored in
    // creator language, or the deterministic "Next up: …" line.
    const reason = String(data.reason ?? "").trim();
    return reason || null;
  }
  if (event.type === "production.task.retrying") {
    return "One scene failed its check — retrying just that scene";
  }
  if (event.type === "production.scene.degraded") {
    return "One scene couldn’t pass its checks even after a retry — a placeholder holds its slot so the rest of the video finishes. Direct that scene here to rebuild it.";
  }
  if (event.type === "artifact.ready_for_review") {
    // Brief, plan and script get substantive messages in onEvent — the chat
    // shows the work itself, not a completion ping. These two stay terse
    // because their substance IS the cut the creator is looking at.
    const artifact = String(data.artifact_type ?? "");
    return {
      scene_visuals: "Cut assembled — every scene stays independently editable",
      voice: "Narration recorded — its measured clips now drive the timing",
    }[artifact] ?? null;
  }
  if (event.type === "run.failed" || event.type === "production.task.failed") {
    return "This step couldn’t pass its checks. I kept the finished work unchanged so recovery stays scoped.";
  }
  return null;
}

// What the build panel's headline says while each chained stage runs, so the
// wait names the work instead of a generic "building".
const STAGE_HEADLINE: Record<string, string> = {
  generate_production_brief: "Reading your topic…",
  generate_teaching_plan: "Planning the lesson…",
  generate_script: "Writing the narration…",
  generate_scene_visuals: "Animating the scenes…",
  generate_voice: "Recording the voiceover…",
};

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
      // Pre-voice estimate: a plan without target durations must not clamp
      // every scene to 1 frame and play a broken N/24-second "video".
      dur: clip?.duration_seconds ?? beat.target_duration_seconds ?? 6,
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
  const [candidates, setCandidates] = useState<SceneCandidate[]>([]);
  const [acceptingTaskId, setAcceptingTaskId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renderState, setRenderState] = useState<"idle" | "rendering" | "done" | "failed">("idle");
  const [renderId, setRenderId] = useState<string | null>(null);
  const commandKeys = useRef(new Map<string, string>());
  const hydrationKey = useRef("");
  const visualVersionId = useRef<string | null>(null);
  const lastEventId = useRef<string | undefined>(undefined);
  const seenEvents = useRef(new Set<string>());

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
    // v1: an unbuilt project has no brief and no job yet — the docked chat's
    // first message becomes the topic and kicks the whole build.
    useStudio.setState({
      connectedUnbuilt:
        !find("production_brief") &&
        !(nextStudio.active_job ?? nextStudio.most_recent_job),
    });
    const planArtifact = find("teaching_plan");
    const scriptArtifact = find("script");
    const visualsArtifact = find("scene_visuals");
    const voiceArtifact = find("voice");
    const candidateJob = [nextStudio.active_job, nextStudio.most_recent_job].find(
      (job) => job?.kind === "generate_scene_visuals",
    );

    setArtifactId(visualsArtifact?.artifact_id ?? null);

    // The approved plan and script, not the newest: the Motion Designer built
    // against those, and pairing its scenes with a later draft would show a cut
    // that was never made.
    const [planResult, scriptResult, visualsResult, voiceResult, candidateResult] = await Promise.all([
      planArtifact
        ? decodeApi.getTeachingPlan(projectId, planArtifact.artifact_id)
        : Promise.resolve(null),
      scriptArtifact
        ? decodeApi.getScript(projectId, scriptArtifact.artifact_id)
        : Promise.resolve(null),
      visualsArtifact
        ? decodeApi.getSceneVisuals(projectId, visualsArtifact.artifact_id)
        : Promise.resolve(null),
      voiceArtifact
        ? decodeApi.getVoice(projectId, voiceArtifact.artifact_id)
        : Promise.resolve(null),
      candidateJob
        ? decodeApi.getSceneCandidates(projectId, candidateJob.job_id)
        : Promise.resolve({ items: [] }),
    ]);

    const approvedOf = <T,>(
      result: { items: { version_id: string; payload: T }[]; approved_version_id: string | null } | null,
    ) =>
      result
        ? (result.items.find((item) => item.version_id === result.approved_version_id) ??
            result.items[0])?.payload ?? null
        : null;

    const visualsVersion =
      visualsResult?.items.find((item) => item.version_id === visualsResult.latest_version_id) ??
      visualsResult?.items[0];
    const voiceVersion =
      voiceResult?.items.find((item) => item.version_id === voiceResult.latest_version_id) ??
      voiceResult?.items[0];
    const candidateVisuals: SceneVisualsPayload | null = visualsVersion?.payload ??
      (candidateResult.items.length
        ? {
            rationale: "These scene candidates are waiting for your review.",
            scenes: candidateResult.items.map((candidate) => candidate.scene),
            visual_findings: { candidates: true },
          }
        : null);
    setCandidates(candidateResult.items);
    // Hydrating the store rather than passing props, because that is where the
    // workspace reads from. Approvals come along so the Edit stage is not gated
    // shut against a project the backend has already approved.
    const nextHydrationKey = [
      planArtifact?.approved_version_id,
      scriptArtifact?.approved_version_id,
      visualsVersion?.version_id,
      voiceVersion?.version_id,
      ...candidateResult.items.map(
        (candidate) => `${candidate.task_id}:${candidate.accepted_at ?? "waiting"}`,
      ),
    ].join(":");
    const nextScenes = toScenes(
      approvedOf(planResult),
      approvedOf(scriptResult),
      candidateVisuals,
      voiceVersion?.payload ?? null,
    );
    if (hydrationKey.current !== nextHydrationKey) {
      const prior = useStudio.getState();
      const selectedId = prior.sc[prior.sceneIdx]?.id;
      const preserveDirectedScenes = visualVersionId.current === (visualsVersion?.version_id ?? null);
      const priorById = new Map(prior.sc.map((scene) => [scene.id, scene]));
      const hydratedScenes = preserveDirectedScenes
        ? nextScenes.map((scene) => {
            const existing = priorById.get(scene.id);
            return existing?.componentSource
              ? { ...scene, componentSource: existing.componentSource, controls: existing.controls }
              : scene;
          })
        : nextScenes;
      const nextIndex = Math.max(0, hydratedScenes.findIndex((scene) => scene.id === selectedId));
      useStudio.setState({
        sc: hydratedScenes,
        sceneIdx: nextIndex,
        playhead: 0,
        playing: false,
        playbackRate: 0,
        visualPick: {},
        staleByScene: {},
        _history: [],
        _future: [],
        regen: null,
      });
      hydrationKey.current = nextHydrationKey;
      visualVersionId.current = visualsVersion?.version_id ?? null;
    }
    setReady(nextScenes.length > 0);

    // HyperFrames scenes carry a duration-agnostic template; fetch each one's
    // resolved+stamped composition in the background (the backend owns the
    // resolver) and swap it in when it lands, so Edit opens immediately and the
    // real animation follows. A React scene has no composition and is skipped.
    const hfBeats = (visualsVersion?.payload?.scenes ?? [])
      .filter((module) => module.composition_html)
      .map((module) => module.beat_id);
    void Promise.all(
      hfBeats.map((beatId) =>
        decodeApi
          .sceneComposition(projectId, beatId)
          .then((composition) => [beatId, composition.html] as const)
          .catch(() => [beatId, null] as const),
      ),
    ).then((entries) => {
      const htmlByBeat = new Map(entries.filter((entry): entry is [string, string] => Boolean(entry[1])));
      if (htmlByBeat.size === 0) return;
      useStudio.setState((state) => ({
        sc: state.sc.map((scene) =>
          htmlByBeat.has(scene.id) ? { ...scene, compositionHtml: htmlByBeat.get(scene.id) } : scene,
        ),
      }));
    });
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const open = async () => {
      setInitialLoading(true);
      setError("");
      try {
        await load();
      } catch (cause) {
        if (active) setError(creatorError(cause, "We couldn’t load these scenes."));
      } finally {
        if (active) setInitialLoading(false);
      }
    };
    void open();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let failures = 0;
    // The stream replays project history when there is no Last-Event-ID. That
    // history still refreshes durable state, but replaying months of old build
    // narration into the room buries the creator's actual conversation.
    const liveSince = Date.now() - 5000;
    const refreshEvents = new Set([
      "artifact.version.created",
      "artifact.ready_for_review",
      "job.succeeded",
      "run.failed",
      "production.scene.candidate.ready",
      "production.scene.candidate.accepted",
    ]);
    const onEvent = (event: ProjectEvent) => {
      // Live agent streaming (ephemeral frames, no persistent id): grow a chat
      // bubble token by token instead of a canned status line.
      if (event.type === "agent.stream.begin") {
        useStudio.getState().beginStream(event.run_id ?? "live");
        return;
      }
      if (event.type === "agent.token") {
        const delta = String((event as unknown as { delta?: string }).delta ?? "");
        useStudio.getState().appendToken(event.run_id ?? "live", delta);
        return;
      }
      if (event.type === "agent.stream.end") {
        useStudio.getState().endStream(event.run_id ?? "live");
        return;
      }
      lastEventId.current = event.id || lastEventId.current;
      if (event.id && seenEvents.current.has(event.id)) return;
      if (event.id) seenEvents.current.add(event.id);
      const occurredAt = Date.parse(event.occurred_at);
      if (Number.isFinite(occurredAt) && occurredAt >= liveSince) {
        void saySubstance(projectId, event).then((said) => {
          if (said) return;
          const message = eventMessage(event);
          // Failures stay full messages — they need reading, not glancing.
          const failed = event.type === "run.failed" || event.type === "production.task.failed";
          if (message) useStudio.getState().say(message, undefined, undefined, !failed);
        });
      }
      if (refreshEvents.has(event.type)) void load().catch(() => undefined);
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
          // A clean return is the server closing an idle stream, not a fault:
          // reconnect immediately. Only real failures grow the backoff, and a
          // stream that worked resets it — otherwise a few blips early in the
          // session pin every later reconnect at the 10s ceiling for good.
          failures = 0;
        } catch {
          if (controller.signal.aborted) return;
          failures += 1;
        }
        await new Promise((resolve) =>
          window.setTimeout(resolve, Math.min(1000 * 2 ** failures, 10000)),
        );
      }
    };
    void connect();
    const poll = window.setInterval(() => void load().catch(() => undefined), 4000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(poll);
    };
  }, [load, projectId]);

  const activeJob = studio?.active_job ?? studio?.most_recent_job;
  const buildFailed = activeJob?.status === "failed";
  const visualBuildJob = [studio?.active_job, studio?.most_recent_job].find(
    (job) => job?.kind === "generate_scene_visuals",
  );
  const selectedBeatId = useStudio((state) => state.sc[state.sceneIdx]?.id);
  const selectedSource = useStudio((state) => state.sc[state.sceneIdx]?.componentSource);
  const selectedCandidate = candidates.find((candidate) => candidate.beat_id === selectedBeatId);
  const candidateProgress = candidates.length
    ? {
        accepted: candidates.filter((candidate) => candidate.accepted_at).length,
        total: candidates.length,
      }
    : undefined;

  const acceptCandidate = async () => {
    if (
      !visualBuildJob ||
      !selectedCandidate ||
      selectedCandidate.accepted_at ||
      !selectedSource ||
      acceptingTaskId
    ) {
      return;
    }
    setAcceptingTaskId(selectedCandidate.task_id);
    setError("");
    try {
      const accepted = await decodeApi.acceptSceneCandidate(
        projectId,
        visualBuildJob.job_id,
        selectedCandidate.task_id,
        selectedSource,
        keyFor(`accept-scene-candidate:${selectedCandidate.task_id}:${selectedSource}`),
      );
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.task_id === accepted.task_id ? accepted : candidate,
        ),
      );
      useStudio
        .getState()
        .say(
          "I applied this scene to the production and left every other candidate waiting for your review.",
          "1 scene applied",
        );
      await load();
    } catch (cause) {
      setError(creatorError(cause, "We couldn’t apply this scene. Nothing else changed."));
    } finally {
      setAcceptingTaskId(null);
    }
  };

  // The per-scene direction loop: faithful patch-in-place, not regenerate. The
  // creator directs one scene in words; the model edits that scene's OWN animation
  // source (`/direct`) and the patched source swaps straight into the preview —
  // the scene's locked facts (its `const TRACE`) survive or the edit is refused.
  // Guarded by the store's `regen` line so a second direction can't overlap the
  // first. Local by design: the edit lands in the preview immediately and is not
  // yet published as an artifact version.
  const directScene = useCallback(
    async (beatId: string, direction: string) => {
      const store = useStudio.getState();
      if (store.regen) {
        // Never a silent no-op: an Apply that lands mid-rebuild must say so,
        // or the creator reads "nothing happened" and clicks again forever.
        store.say("I’m still applying the previous direction — give it a moment, then apply again.");
        return;
      }
      const sceneIndex = store.sc.findIndex((scene) => scene.id === beatId);
      const scene = store.sc[sceneIndex];
      if (!scene?.componentSource) {
        store.say("I can only direct a scene that has a generated animation. Nothing changed.");
        return;
      }

      // Direction owns one scene, so it also owns the preview while the edit
      // runs. Previously the overlay appeared but playback kept advancing into
      // later scenes, making a scoped edit look like it was rebuilding the cut.
      // Hold the current frame when this scene is already selected; otherwise
      // navigate once to the scene the creator named.
      if (store.sceneIdx === sceneIndex) store.setPlaybackRate(0);
      else store.select(sceneIndex);
      store.setRegen("Applying your direction to this scene…");
      try {
        const { source } = await decodeApi.direct(scene.componentSource, direction);
        useStudio.setState((state) => ({
          sc: state.sc.map((item) =>
            item.id === beatId ? { ...item, componentSource: source } : item,
          ),
        }));
        useStudio
          .getState()
          .say(
            "I edited this scene's own animation to your direction and kept its locked facts and every other scene exactly as they were.",
            "1 scene directed",
          );
      } catch (cause) {
        useStudio
          .getState()
          .say(
            cause instanceof DecodeApiError && cause.problem.code === "facts_altered"
              ? cause.problem.detail
              : "I couldn’t apply that direction. Nothing changed — your scenes are safe.",
          );
      } finally {
        useStudio.getState().setRegen(null);
      }
    },
    [],
  );

  // v1: the topic-to-build kick. On an unbuilt project the docked chat's first
  // message is the topic — turn it into a text source + default intent, then
  // generate the brief. The backend auto-continues the whole video from there
  // (Project.auto_continue), so nothing else has to be triggered by the client.
  const startBuild = useCallback(
    async (topic: string, options?: BuildOptions) => {
      const t = topic.trim();
      if (!t) return;
      const file = new File([t], "topic.txt", { type: "text/plain;charset=utf-8" });
      const uploaded = await decodeApi.uploadSource(projectId, file, "text", idempotencyKey());
      const intent = await decodeApi.publishIntent(
        projectId,
        {
          creative_brief: t,
          audience: options?.audience ?? "General audience",
          target_duration_seconds: options?.target_duration_seconds ?? 300,
          runtime_mode: "fixed",
          depth: options?.depth ?? "balanced",
          narration_style: "professional",
          brand: { colors: [], fonts: null, guidelines: null },
        },
        idempotencyKey(),
      );
      await decodeApi.generateBrief(
        projectId,
        [uploaded.source_version_id],
        intent.version_id,
        idempotencyKey(),
      );
      useStudio.setState({ connectedUnbuilt: false });
      await load().catch(() => undefined);
    },
    [projectId, load],
  );

  // Hand the docked chat the real project + the real per-scene apply + the build
  // kick, so the orchestrator's "direct_scene" proposal runs the same path the
  // Inspector's direction field does, and the first message can start the build.
  // Cleared on unmount so the prototype chat stays seeded.
  useEffect(() => {
    useStudio.setState((state) => ({
      connectedProjectId: projectId,
      directScene,
      startBuild,
      ...(state.connectedProjectId === projectId ? {} : { thread: loadThread(projectId), sc: [] }),
    }));
    return () =>
      useStudio.setState({
        connectedProjectId: null,
        directScene: null,
        startBuild: null,
        connectedUnbuilt: false,
      });
  }, [projectId, directScene, startBuild]);

  // Every thread change lands in storage, so a reload mid-build keeps what was
  // already said even though the live stream itself is ephemeral.
  useEffect(
    () =>
      useStudio.subscribe((state, prev) => {
        if (state.thread !== prev.thread) saveThread(projectId, state.thread);
      }),
    [projectId],
  );

  const startExport = async () => {
    if (!artifactId || renderState === "rendering") return;
    setRenderState("rendering");
    setError("");
    const sc = useStudio.getState().sc;
    const visualPick = useStudio.getState().visualPick;
    try {
      const result = await decodeApi.startRender(
        projectId,
        sc.map((scene) => {
          // The heavy render substrates never go back to the server: the export
          // path does not re-render from them. (HyperFrames export is staged —
          // it moves to `hyperframes render`, not this Remotion path.)
          const { componentSource, compositionHtml, controls, ...rest } = scene;
          void componentSource;
          void compositionHtml;
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
      statusLabel={`Edit · ${
        initialLoading ? "loading" : artifactId ? "saved" : studio?.current_stage === "processing" ? "building" : "not started"
      }`}
      loading={initialLoading}
      fill={ready}
      onExport={startExport}
      exportDisabled={!artifactId}
    >
      {!ready ? (
        <div className="min-h-full bg-sunken-2 text-ink">
        {initialLoading ? (
          <EditSkeleton />
        ) : buildFailed && activeJob ? (
          <EditFailure
            message="The crew couldn’t finish this production step. Everything that already passed its checks is safe."
            onRetry={() => router.push(`/studio/projects/${projectId}/jobs/${activeJob.job_id}`)}
            actionLabel="Open recovery"
          />
        ) : studio?.current_stage === "processing" ? (
          <main className="mx-auto flex min-h-full w-full max-w-[560px] flex-col items-center justify-center gap-4 p-8 text-center">
            <Spinner size={18} />
            <h1 className="font-display text-[clamp(22px,3vw,32px)] font-semibold tracking-[-0.03em] text-ink">
              {STAGE_HEADLINE[activeJob?.kind ?? ""] ?? "Building your video…"}
            </h1>
            <p className="max-w-[42ch] text-[13px] leading-[1.65] text-t6">
              Follow along in the chat — I’m narrating each step as it happens. The cut
              appears here the moment the scenes are ready.
            </p>
          </main>
        ) : error && (!studio || artifactId) ? (
          <EditFailure message={error} onRetry={() => void load()} />
        ) : artifactId ? (
          // Artifacts exist but produced no playable scenes (a plan whose
          // beats carry no ids, or an empty plan). Without this branch the
          // creator lands back on the topic hero — but the project is no
          // longer unbuilt, so typing there routes to revision, not a build:
          // a dead end with no way forward.
          <EditFailure
            message="This build finished without any playable scenes. Ask for a rebuild in the chat, or open recovery to see what happened."
            onRetry={() => void load()}
          />
        ) : (
          <main className="mx-auto flex min-h-full w-full max-w-[720px] flex-col items-center justify-center p-8 text-center">
            <StageKicker>New video</StageKicker>
            <h1 className="mt-4 font-display text-[clamp(28px,4vw,44px)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
              What should we teach?
            </h1>
            <p className="mt-4 max-w-[46ch] text-[13.5px] leading-[1.7] text-t6">
              Type a topic in the chat — like “Explain backpropagation.” Decode builds
              the whole video from it: the plan, the script, the scenes, and the
              narration. You direct any change right here, in the chat.
            </p>
            {error && <p role="alert" className="mt-4 text-[12px] text-[#8E2F19]">{error}</p>}
          </main>
        )}
        </div>
       ) : (
        <div className="flex min-h-0 flex-col lg:h-full">
          <div className="min-h-0 flex-1">
          <Edit
            onDirectScene={directScene}
            showInspector={false}
            showTimeline={false}
            candidateState={selectedCandidate && selectedSource ? (selectedCandidate.accepted_at ? "accepted" : "waiting") : null}
            candidateApplying={acceptingTaskId === selectedCandidate?.task_id}
            candidateProgress={candidateProgress}
            onApplyCandidate={() => void acceptCandidate()}
          />
          </div>
          {buildFailed && activeJob && (
            // A later stage (voice, a re-run) failing after scenes exist must
            // still surface somewhere actionable, not only as a chat line.
            <div className="flex flex-none items-center gap-2 border-t border-[var(--nle-line)] bg-[var(--nle-panel)] px-4 py-2">
              <span className="text-[11.5px] text-[#C4553B]">
                A production step failed — everything already built is safe.
              </span>
              <button
                onClick={() => router.push(`/studio/projects/${projectId}/jobs/${activeJob.job_id}`)}
                className="ml-auto text-[11.5px] font-medium text-accent-deep hover:text-accent"
              >
                Open recovery
              </button>
            </div>
          )}
          {renderState !== "idle" && (
            <div className="flex flex-none items-center gap-2 border-t border-[var(--nle-line)] bg-[var(--nle-panel)] px-4 py-2">
              <span className="text-[11.5px] text-[var(--nle-muted)]">
                {renderState === "rendering" ? "Exporting your video…" : renderState === "done" ? "Export ready" : error || "Export failed."}
              </span>
              {renderState === "failed" && (
                <button onClick={startExport} className="ml-auto text-[11.5px] font-medium text-accent-deep hover:text-accent">Retry</button>
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
       <div className="studio-shell">
         <div className="studio-surface p-6">
           <div className="h-3 w-24 rounded-full bg-sunken-3" />
           <div className="mt-4 h-9 w-1/2 rounded-xl bg-sunken-3" />
           <div className="mt-5 aspect-video w-full rounded-2xl bg-sunken-3" />
         </div>
       </div>
    </main>
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
      <div role="alert" className="studio-surface p-6 sm:p-8">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken-3 text-accent-deep">
          <TriangleAlert size={17} />
        </span>
        <StageKicker className="mt-5">Edit</StageKicker>
        <h1 className="mt-3 font-display text-[clamp(26px,4vw,40px)] font-semibold tracking-[-0.035em] text-ink">
          The scenes didn’t open
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
