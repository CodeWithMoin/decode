import type {
  ArtifactHistoryResponse,
  ArtifactLineageResponse,
  ArtifactVersion,
  ApprovalResult,
  CreatedProject,
  GenerateBriefResult,
  GenerateSceneVisualsResult,
  GenerateScriptResult,
  GenerateTeachingPlanResult,
  JobDetail,
  ProblemResponse,
  ProductionBriefPayload,
  ProductionBriefProjection,
  ProductionIntentPayload,
  ProjectEvent,
  ProjectListResponse,
  SceneVisualsPayload,
  ScriptPayload,
  SourceUploadResult,
  StudioSnapshot,
  TeachingPlanPayload,
  UsageResponse,
  VoicePayload,
} from "./types";

const configuredBase = process.env.NEXT_PUBLIC_DECODE_API_URL?.trim();
export const decodeApiConfigured = Boolean(configuredBase);
const API_BASE = (configuredBase ?? "").replace(/\/$/, "");

/** Absolute URL for a stored media object key (narration audio, etc.). */
export function mediaUrl(key: string): string {
  return `${API_BASE}/api/v1/voice/${key}`;
}

export class DecodeApiError extends Error {
  constructor(public readonly problem: ProblemResponse) {
    super(problem.detail);
    this.name = "DecodeApiError";
  }
}

export const idempotencyKey = () => crypto.randomUUID();

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    let body: Partial<ProblemResponse> = {};
    try {
      body = (await response.json()) as Partial<ProblemResponse>;
    } catch {
      // A proxy or network edge may return HTML. Keep the UI error safe.
    }
    throw new DecodeApiError({
      code: body.code ?? "request_failed",
      status: body.status ?? response.status,
      detail: body.detail ?? `The request failed (${response.status}).`,
      request_id: body.request_id,
      retryable: body.retryable ?? response.status >= 500,
      field_errors: body.field_errors,
      current_latest_version_id: body.current_latest_version_id,
      active_job_id: body.active_job_id,
      approved_version_id: body.approved_version_id,
      approved_intent_version_id: body.approved_intent_version_id,
    });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const decodeApi = {
  listProjects: (cursor?: string) =>
    request<ProjectListResponse>(
      `/api/v1/projects?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),

  createProject: (title: string | undefined, key: string) =>
    request<CreatedProject>("/api/v1/projects", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ title: title || null }),
    }),

  deleteProject: (projectId: string, key: string) =>
    request<{ project_id: string; deleted_at: string }>(`/api/v1/projects/${projectId}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": key },
    }),

  uploadSource: (projectId: string, file: File, kind: string, key: string) => {
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("source_kind", kind);
    return request<SourceUploadResult>(`/api/v1/projects/${projectId}/sources`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body,
    });
  },

  publishIntent: (projectId: string, payload: ProductionIntentPayload, key: string) =>
    request<ArtifactVersion<ProductionIntentPayload>>(
      `/api/v1/projects/${projectId}/production-intent/versions`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(payload),
      },
    ),

  generateBrief: (
    projectId: string,
    sourceVersionIds: string[],
    intentVersionId: string,
    key: string,
  ) =>
    request<GenerateBriefResult>(
      `/api/v1/projects/${projectId}/production-brief/generations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          source_version_ids: sourceVersionIds,
          intent_version_id: intentVersionId,
        }),
      },
    ),

  generateTeachingPlan: (
    projectId: string,
    briefVersionId: string,
    intentVersionId: string,
    key: string,
  ) =>
    request<GenerateTeachingPlanResult>(
      `/api/v1/projects/${projectId}/teaching-plan/generations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          brief_version_id: briefVersionId,
          intent_version_id: intentVersionId,
        }),
      },
    ),

  generateScript: (
    projectId: string,
    planVersionId: string,
    intentVersionId: string,
    key: string,
  ) =>
    request<GenerateScriptResult>(`/api/v1/projects/${projectId}/script/generations`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        plan_version_id: planVersionId,
        intent_version_id: intentVersionId,
      }),
    }),

  /**
   * Save an edited script.
   *
   * A complete replacement, like `editBrief` — the endpoint takes the whole
   * payload and publishes a new immutable version rather than patching one.
   * `baseVersionId` is what the edit was made against; a mismatch comes back
   * 409 rather than clobbering someone else's newer version.
   */
  editScript: (
    projectId: string,
    artifactId: string,
    baseVersionId: string,
    payload: ScriptPayload,
    key: string,
  ) =>
    request<ArtifactVersion<ScriptPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ base_version_id: baseVersionId, schema_version: 1, payload }),
      },
    ),

  getScript: (projectId: string, artifactId: string) =>
    request<ArtifactHistoryResponse<ScriptPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions?limit=50`,
    ),

  generateSceneVisuals: (
    projectId: string,
    scriptVersionId: string,
    intentVersionId: string,
    key: string,
  ) =>
    request<GenerateSceneVisualsResult>(
      `/api/v1/projects/${projectId}/scene-visuals/generations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          script_version_id: scriptVersionId,
          intent_version_id: intentVersionId,
        }),
      },
    ),

  getSceneVisuals: (projectId: string, artifactId: string) =>
    request<ArtifactHistoryResponse<SceneVisualsPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions?limit=50`,
    ),

  // The per-scene direction loop: redraw one beat's scene under the creator's
  // words. Only that scene changes; the version id is the cut they are editing,
  // so a stale one is refused rather than silently redrawn.
  regenerateSceneVisual: (
    projectId: string,
    sceneVisualsVersionId: string,
    beatId: string,
    direction: string,
    key: string,
  ) =>
    request<{ job_id: string; run_id: string; status: string; kind: string }>(
      `/api/v1/projects/${projectId}/scene-visuals/regenerations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          scene_visuals_version_id: sceneVisualsVersionId,
          beat_id: beatId,
          direction,
        }),
      },
    ),

  generateVoice: (projectId: string, scriptVersionId: string, intentVersionId: string, key: string) =>
    request<{ job_id: string; run_id: string; status: string; kind: string }>(
      `/api/v1/projects/${projectId}/voice/generations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          script_version_id: scriptVersionId,
          intent_version_id: intentVersionId,
        }),
      },
    ),

  getVoice: (projectId: string, artifactId: string) =>
    request<ArtifactHistoryResponse<VoicePayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions?limit=50`,
    ),

  getStudio: (projectId: string) =>
    request<StudioSnapshot>(`/api/v1/projects/${projectId}/studio`),

  getJob: (projectId: string, jobId: string) =>
    request<JobDetail>(`/api/v1/projects/${projectId}/jobs/${jobId}`),

  retryJob: (projectId: string, jobId: string, failedRunId: string, key: string) =>
    request<{ run_id: string }>(
      `/api/v1/projects/${projectId}/jobs/${jobId}/retries`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ expected_failed_run_id: failedRunId }),
      },
    ),

  getBrief: (projectId: string) =>
    request<ProductionBriefProjection>(
      `/api/v1/projects/${projectId}/production-brief`,
    ),

  /**
   * The creator's direction, read back.
   *
   * There is no dedicated GET for production intent — the versions endpoint is
   * generic, so the artifact id comes from the studio snapshot and the newest
   * version is the one that produced the brief. `limit=1` because nothing here
   * needs the history.
   */
  getIntent: (projectId: string, artifactId: string) =>
    request<ArtifactHistoryResponse<ProductionIntentPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions?limit=1`,
    ),

  getTeachingPlan: (projectId: string, artifactId: string) =>
    request<ArtifactHistoryResponse<TeachingPlanPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions?limit=50`,
    ),

  editBrief: (
    projectId: string,
    artifactId: string,
    baseVersionId: string,
    payload: ProductionBriefPayload,
    key: string,
  ) =>
    request<ArtifactVersion<ProductionBriefPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ base_version_id: baseVersionId, schema_version: 1, payload }),
      },
    ),

  approveArtifact: (
    projectId: string,
    artifactId: string,
    versionId: string,
    note: string | null,
    key: string,
  ) =>
    request<ApprovalResult>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}/approvals`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ decision: "approved", note }),
      },
    ),

  getHistory: <TPayload = ProductionBriefPayload>(projectId: string, artifactId: string, cursor?: string | number) =>
    request<ArtifactHistoryResponse<TPayload>>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions?limit=50${cursor !== undefined ? `&cursor=${encodeURIComponent(String(cursor))}` : ""}`,
    ),

  getLineage: (projectId: string, artifactId: string, versionId: string) =>
    request<ArtifactLineageResponse>(
      `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}/lineage`,
    ),

  getUsage: (projectId: string, jobId: string) =>
    request<UsageResponse>(`/api/v1/projects/${projectId}/jobs/${jobId}/usage`),

  startRender: (projectId: string, scenes: object[], visualPick: Record<number, string>, key: string) =>
    request<{ render_id: string; status: string }>(
      `/api/v1/projects/${projectId}/renders`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ scenes, visual_pick: visualPick }),
      },
    ),

  getRender: (renderId: string) =>
    request<{ render_id: string; status: string; error?: string; download_path?: string }>(
      `/api/v1/renders/${renderId}`,
    ),
};

/** Fetch-based SSE allows an explicit Last-Event-ID on reconnect. */
export async function streamProjectEvents({
  projectId,
  lastEventId,
  signal,
  onEvent,
}: {
  projectId: string;
  lastEventId?: string;
  signal: AbortSignal;
  onEvent: (event: ProjectEvent) => void;
}): Promise<string | undefined> {
  const headers = new Headers({ Accept: "text/event-stream" });
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);
  const response = await fetch(
    `${API_BASE}/api/v1/projects/${projectId}/events/stream`,
    { headers, signal, cache: "no-store" },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Event stream unavailable (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latestId = lastEventId;
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseProjectEventBlock(block);
      if (event) {
        latestId = event.id || latestId;
        onEvent(event);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  return latestId;
}

/** Parse one complete SSE block and normalize transport IDs at the boundary. */
export function parseProjectEventBlock(block: string): ProjectEvent | null {
  let wireId: string | undefined;
  let eventType = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) wireId = line.slice(3).trim();
    else if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  const parsed = JSON.parse(data.join("\n")) as Omit<ProjectEvent, "id"> & {
    id?: string | number;
    type?: string;
  };
  return {
    ...parsed,
    id: String(parsed.id ?? wireId ?? ""),
    type: parsed.type ?? eventType,
  };
}
