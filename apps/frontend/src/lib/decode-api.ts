import type {
  ArtifactHistoryResponse,
  ArtifactLineageResponse,
  ArtifactVersion,
  ApprovalResult,
  CreatedProject,
  GenerateBriefResult,
  GenerateTeachingPlanResult,
  JobDetail,
  ProblemResponse,
  ProductionBriefPayload,
  ProductionBriefProjection,
  ProductionIntentPayload,
  ProjectEvent,
  ProjectListResponse,
  SourceUploadResult,
  StudioSnapshot,
  TeachingPlanPayload,
  UsageResponse,
} from "./types";

const configuredBase = process.env.NEXT_PUBLIC_DECODE_API_URL?.trim();
export const decodeApiConfigured = Boolean(configuredBase);
const API_BASE = (configuredBase ?? "").replace(/\/$/, "");

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

  /**
   * Turn running the stages back to back on or off.
   *
   * No idempotency key: this sets a value rather than starting work, so a
   * repeat of the same request is the same state and costs nothing.
   */
  setAutoContinue: (projectId: string, autoContinue: boolean) =>
    request<{ project_id: string; auto_continue: boolean }>(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ auto_continue: autoContinue }),
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
