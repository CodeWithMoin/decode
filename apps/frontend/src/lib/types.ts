/**
 * Decode — domain types.
 *
 * These mirror what the FastAPI backend will return. Keep this file as the
 * single shape authority: `lib/api.ts` is the only module that produces these
 * values, so swapping seed content for real `fetch` calls touches nothing else.
 */

export type ScreenId =
  | "landing"
  | "dashboard"
  | "upload"
  | "processing"
  | "project";

export type TabId =
  | "overview"
  | "plan"
  | "script"
  | "edit"
  | "export";

export type CrewId =
  | "producer"
  | "director"
  | "writer"
  | "motion"
  | "editor";

export interface CrewMember {
  id: CrewId;
  name: string;
  initial: string;
  color: string;
  /** The stage this specialist owns. */
  stage: TabId;
  /**
   * The named artifact this specialist hands to the next. Specialists never
   * exchange anything else — the chain of artifacts is the contract between
   * them, so it belongs on the crew rather than being restated per surface.
   */
  artifact: string;
}

export type AnimationKind =
  | "Fade sequence"
  | "Token flow"
  | "Equation build"
  | "Head split"
  | "Wave overlay"
  | "Stack build"
  | "Chart reveal"
  | "Zoom out";

export interface Source {
  ext: string;
  file: string;
  title: string;
  author: string;
  meta: string;
  pages: string;
  words: string;
  kind: "paper" | "book" | "docs" | "slides" | "article";
  /** Browser bytes for the connected upload flow. Prototype sources omit it. */
  upload?: File;
}

/* ------------------------------------------------------------------
   Walking-skeleton transport types. These deliberately live beside, but do
   not replace, the visual prototype types above.
   ------------------------------------------------------------------ */

export type ProjectStatus = "draft" | "processing" | "ready" | "failed" | string;
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface ValidationFieldError {
  type: string;
  loc: Array<string | number>;
  msg: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
  url?: string;
}

export interface ProblemResponse {
  code: string;
  status: number;
  detail: string;
  request_id?: string;
  retryable?: boolean;
  /** FastAPI/Pydantic returns an error array; the map shape supports older deployments. */
  field_errors?: ValidationFieldError[] | Record<string, string[]>;
  current_latest_version_id?: string;
  active_job_id?: string;
}

export interface ProjectSummary {
  project_id: string;
  title: string;
  status: ProjectStatus;
  current_stage?: "processing" | "understanding" | string;
  source_count?: number;
  created_at: string;
  updated_at: string;
  active_job_id?: string | null;
  most_recent_job_id?: string | null;
}

export interface ProjectListResponse {
  items: ProjectSummary[];
  next_cursor?: string | null;
}

export interface CreatedProject {
  project_id: string;
  title: string;
  status: ProjectStatus;
  created_at: string;
}

export interface SourceUploadResult {
  source_id: string;
  artifact_id: string;
  source_version_id: string;
  filename?: string;
  status?: string;
}

export interface ProductionIntentPayload {
  creative_brief: string | null;
  audience: string;
  target_duration_seconds: 60 | 180 | 300 | 600 | null;
  runtime_mode: "fixed" | "deep_dive";
  depth: "intuition_first" | "balanced" | "rigorous";
  narration_style: "professional" | "friendly" | "storyteller";
  brand: {
    colors: string[];
    fonts: string | null;
    guidelines: string | null;
  };
}

export interface KeyConcept {
  name: string;
  importance: "core" | "supporting";
}

export interface TeachingOpportunity {
  title: string;
  rationale: string;
}

export interface ProductionBriefPayload {
  title: string;
  summary: string;
  audience_profile: string;
  learning_objectives: string[];
  key_concepts: KeyConcept[];
  prerequisites: string[];
  scope_in: string[];
  scope_out: string[];
  teaching_opportunities: TeachingOpportunity[];
  source_findings: Record<string, unknown>;
  open_questions: string[];
}

export interface EvaluationCheck {
  name: string;
  outcome: string;
  evidence: string;
}

export interface EvaluationSummary {
  evaluation_id: string;
  artifact_version_id: string;
  evaluator: string;
  decision: "pass" | "needs_attention" | "unable_to_evaluate";
  checks: EvaluationCheck[];
  summary: string;
  created_at: string;
}

export interface ArtifactVersion<TPayload = Record<string, unknown>> {
  artifact_id: string;
  version_id: string;
  sequence: number;
  artifact_type: string;
  schema_version: number;
  payload: TPayload;
  content_hash: string;
  created_at: string;
  created_by?: string;
  owner_role?: string;
  run_id?: string | null;
  supersedes_version_id?: string | null;
  rationale?: string | null;
}

export interface ProductionBriefProjection {
  artifact_id: string;
  latest_version_id: string;
  approved_version_id: string | null;
  latest_is_approved: boolean;
  latest_version: ArtifactVersion<ProductionBriefPayload>;
  latest_evaluation: EvaluationSummary | null;
}

export interface ArtifactHistoryResponse {
  items: ArtifactVersion<ProductionBriefPayload>[];
  latest_version_id: string;
  approved_version_id: string | null;
  next_cursor?: string | number | null;
}

export interface ArtifactLineageResponse {
  artifact_id: string;
  version_id: string;
  parents: ArtifactLineageVersion[];
  children: ArtifactLineageVersion[];
}

export interface ArtifactLineageVersion {
  artifact_id: string;
  artifact_type: string;
  version_id: string;
  sequence: number;
  role: string;
  created_at: string;
}

export interface JobFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobDetail {
  job_id: string;
  project_id?: string;
  kind: "generate_production_brief";
  status: JobStatus;
  active_run_id: string | null;
  requested_input_versions:
    | Array<{ version_id: string; role: "source" | "production_intent" | string }>
    | { source_version_ids: string[]; intent_version_id: string; schema: number };
  result_artifact_version_id: string | null;
  failure: JobFailure | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface GenerateBriefResult {
  job_id: string;
  run_id?: string;
  status: JobStatus;
}

export interface JobSummary {
  job_id: string;
  status: JobStatus;
  active_run_id: string | null;
}

export interface StudioSnapshot {
  project: ProjectSummary;
  sources: Array<{ source_id: string; filename?: string; title?: string; version_id?: string; size_bytes?: number; status?: string }>;
  current_stage: "processing" | "understanding" | string;
  active_job?: JobSummary | null;
  most_recent_job?: JobSummary | null;
  artifacts: Array<{
    artifact_id: string;
    artifact_type: string;
    latest_version_id: string | null;
    approved_version_id: string | null;
  }>;
  allowed_actions: {
    can_generate_brief?: boolean;
    can_edit_brief?: boolean;
    can_approve_brief?: boolean;
    can_retry_job?: boolean;
  };
}

export interface UsageRecord {
  provider: string;
  operation: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  estimated_cost_usd: string;
  run_id: string | null;
  artifact_version_id: string | null;
}

export interface UsageResponse { items: UsageRecord[] }

export interface ProjectEvent {
  id: string;
  type: string;
  project_id: string;
  job_id: string | null;
  run_id: string | null;
  artifact_id: string | null;
  artifact_version_id: string | null;
  occurred_at: string;
  data: Record<string, unknown>;
}

export interface Scene {
  /** Stable id — survives reorder, split, merge and duplicate. */
  id: string;
  title: string;
  /** Seconds. The only stored timing value; everything else is derived. */
  dur: number;
  anim: AnimationKind;
  /** Why the crew made this call. Never empty — a handoff without a
   *  rationale is not finished. */
  reason: string;
  objective: string;
  caption: string;
  prompt: string;
  /** Canvas chips — the abstract stand-in for a generated visual. */
  viz: string[];
  /** Index into `viz` that is emphasised in accent. */
  hot: number;
  narration: string;
  /** A genuinely different second draft. Regeneration swaps between the
   *  two so the change is visibly real. */
  alt: string;
  /** True when `narration` currently holds the alternate draft. */
  altUsed: boolean;
}

/**
 * Optional brand kit. Everything here is nullable because the creation flow
 * must stay under a minute — a brand kit is something you attach once and
 * forget, never a gate on starting.
 */
export interface BrandKit {
  logo: string | null;
  colors: string[];
  fonts: string | null;
  guidelines: string | null;
}

export interface Approvals {
  understanding: boolean;
  plan: boolean;
  script: boolean;
}

export interface ThreadMessage {
  id: string;
  who: "p" | "u";
  text: string;
  /** A short proof that something actually changed. */
  receipt?: string;
}

export interface ProcessingStep {
  label: string;
  detail: string;
  time: string;
}

export interface ProjectCard {
  id: string;
  title: string;
  meta: string;
  status: string;
  pillBg: string;
  pillFg: string;
  sourceKind: string;
  currentStage: string;
  nextAction: string;
  progress: number;
}

export interface Template {
  glyph: string;
  title: string;
  desc: string;
}

export interface RecentFile {
  ext: string;
  name: string;
  when: string;
  src: Source;
}

export interface ExampleSource {
  name: string;
  meta: string;
  src: Source;
}

export interface Opportunity {
  t: string;
  d: string;
}

export interface Dependency {
  a: string;
  b: string;
}

/** The Motion Designer's open question on a scene. */
export interface SceneNote {
  crew: CrewId;
  text: string;
  options: { key: "A" | "B"; title: string; desc: string }[];
}

export type RenderState = "idle" | "rendering" | "done";

/** Downstream work that no longer matches the current scene source. */
export type StaleKind = "visual" | "assets" | "voice";
