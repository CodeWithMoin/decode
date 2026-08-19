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
  | "edit";

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

export type SceneFont =
  | "Space Grotesk"
  | "Inter"
  | "Bricolage Grotesque"
  | "Geist Mono";

export interface SceneVisualStyle {
  font: SceneFont;
  weight: 400 | 500 | 600 | 700;
  size: number;
  textColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  /** Centered composition offset in 1920×1080 canvas pixels. */
  x: number;
  y: number;
  scale: number;
  opacity: number;
  blur: number;
}

export type SceneKeyframeProperty = "size" | "x" | "y" | "scale" | "opacity" | "blur";

export interface SceneVisualKeyframe {
  /** Normalized scene progress, so retiming scales animation without a sync step. */
  at: number;
  value: number;
}

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
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type JobKind = "generate_production_brief" | "generate_teaching_plan" | string;

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
  approved_version_id?: string;
  approved_intent_version_id?: string;
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

export interface ProductionBriefPayload {
  title: string;
  summary: string;
  audience_profile: string;
  learning_objectives: string[];
  key_concepts: KeyConcept[];
  prerequisites: string[];
  scope_in: string[];
  scope_out: string[];
  source_findings: Record<string, unknown>;
  open_questions: string[];
}

export interface TeachingPlanBeat {
  id?: string;
  title: string;
  objective: string;
  target_duration_seconds: number;
  section_id?: string;
  key_points?: string[];
  depends_on?: string[];
  brief_support?: {
    learning_objectives?: number[];
    key_concepts?: string[];
    scope_in?: number[];
  };
  example?: string | null;
  visual_opportunity?: string | null;
  /** Schema v1 history compatibility. New plans use section_id. */
  act?: "problem" | "mechanism" | "payoff";
}

export interface TeachingPlanSection {
  id: string;
  title: string;
  purpose: string;
}

export interface TeachingPlanPayload {
  structure_name?: string;
  sections?: TeachingPlanSection[];
  through_line: string;
  rationale: string;
  beats: TeachingPlanBeat[];
  plan_findings: Record<string, unknown>;
}

/** One beat's narration — the only editable copy of those words. */
export interface ScriptBeat {
  beat_id: string;
  narration: string;
}

export interface ScriptPayload {
  rationale: string;
  beats: ScriptBeat[];
  script_findings: Record<string, unknown>;
}

/** One knob the settings panel may offer on a scene, as the module declares it. */
export interface SceneControl {
  name: string;
  type: "string" | "number" | "color" | "boolean";
  label: string;
  default: string | number | boolean;
  minimum?: number | null;
  maximum?: number | null;
  step?: number | null;
}

export interface SceneModule {
  beat_id: string;
  controls: SceneControl[];
  /** Legacy React scene (Remotion). Optional during the HyperFrames migration. */
  component_source?: string;
  /** A HyperFrames composition (duration-agnostic template) — the new substrate. */
  composition_html?: string;
}

/** The stamped composition for one scene, resolved by the backend for playback. */
export interface SceneComposition {
  html: string;
  duration: number;
  beats: { beat: string; start: number; duration: number }[];
  unresolved: { name: string; reason: string }[];
}

export interface SceneVisualsPayload {
  rationale: string;
  scenes: SceneModule[];
  visual_findings: Record<string, unknown>;
}

export interface SceneCandidate {
  task_id: string;
  beat_id: string;
  accepted_at: string | null;
  scene: SceneModule;
  rationale: string;
}

export interface VoiceClip {
  beat_id: string;
  audio_key: string;
  duration_seconds: number;
}

export interface VoicePayload {
  rationale: string;
  clips: VoiceClip[];
  voice_findings: Record<string, unknown>;
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
  blob_manifest?: Record<string, unknown> | null;
  is_latest?: boolean;
  is_approved?: boolean;
  latest_evaluation?: EvaluationSummary | null;
}

export interface ProductionBriefProjection {
  artifact_id: string;
  latest_version_id: string;
  approved_version_id: string | null;
  latest_is_approved: boolean;
  latest_version: ArtifactVersion<ProductionBriefPayload>;
  latest_evaluation: EvaluationSummary | null;
  approval: ApprovalRecord | null;
}

/** Who approved the current version. `automatic` means the production continued
 *  on its own and nobody clicked, which the studio has to say out loud. */
export interface ApprovalRecord {
  version_id: string;
  actor_id: string;
  automatic: boolean;
  note: string | null;
  created_at: string;
}

export interface ArtifactHistoryResponse<TPayload = ProductionBriefPayload> {
  artifact_id: string;
  items: ArtifactVersion<TPayload>[];
  latest_version_id: string | null;
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

export interface ProductionTaskSummary {
  task_id: string;
  kind: string;
  stable_key: string;
  status: "pending" | JobStatus;
  priority: number;
  attempt: number;
  max_attempts: number;
  input: Record<string, unknown>;
  failure: JobFailure | null;
  started_at: string | null;
  finished_at: string | null;
  accepted_at: string | null;
}

export interface JobDetail {
  job_id: string;
  project_id?: string;
  kind: JobKind;
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
  tasks?: ProductionTaskSummary[];
}

export interface GenerateBriefResult {
  job_id: string;
  run_id?: string;
  status: JobStatus;
}

export interface GenerateTeachingPlanResult {
  job_id: string;
  run_id: string;
  status: JobStatus;
  kind: "generate_teaching_plan";
  requested_input_versions: {
    brief_version_id: string;
    intent_version_id: string;
    schema: number;
  };
}

export interface GenerateScriptResult {
  job_id: string;
  run_id: string;
  status: JobStatus;
  kind: "generate_script";
  requested_input_versions: {
    plan_version_id: string;
    intent_version_id: string;
    schema: number;
  };
}

export interface GenerateSceneVisualsResult {
  job_id: string;
  run_id: string;
  status: JobStatus;
  kind: "generate_scene_visuals";
  requested_input_versions: {
    script_version_id: string;
    intent_version_id: string;
    schema: number;
  };
}

export interface ApprovalResult {
  approval_id: string;
  artifact_id: string;
  version_id: string;
  decision: "approved";
  note: string | null;
  actor_id: string;
  created_at: string;
  latest_version_id: string;
  approved_version_id: string;
}

export interface JobSummary {
  job_id: string;
  kind?: JobKind;
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
    can_generate_plan?: boolean;
    can_approve_plan?: boolean;
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
  estimated_cost_usd: string | null;
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
  /** Clip duration in seconds; runtime and displayed timing remain derived. */
  dur: number;
  /** Clip-level visual fades in seconds. Applied by the Remotion host. */
  fadeIn?: number;
  fadeOut?: number;
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
  /** Scene-local art direction. Missing values inherit the Decode defaults. */
  visualStyle?: Partial<SceneVisualStyle>;
  /** Parameter animation keyed to normalized scene progress. */
  visualKeyframes?: Partial<Record<SceneKeyframeProperty, SceneVisualKeyframe[]>>;
  narration: string;
  /** A genuinely different second draft. Regeneration swaps between the
   *  two so the change is visibly real. */
  alt: string;
  /** True when `narration` currently holds the alternate draft. */
  altUsed: boolean;
  /**
   * Whether this beat is in the video.
   *
   * Absent means enabled — every existing scene stays in the cut without a
   * migration, and only a scene someone deliberately switched off carries the
   * flag. Disabling is reversible and non-destructive: the beat keeps its
   * narration, its visuals and its place in the order, it just stops playing
   * and stops counting toward the runtime.
   */
  disabled?: boolean;
  /** Whether this beat's audio is muted. Muted beats still play visually
   *  but contribute no sound. Absent means unmuted. */
  muted?: boolean;
  /** When true, the beat cannot be selected, moved, split, or deleted. */
  locked?: boolean;
  /**
   * The Motion Designer's generated animation for this beat, as source.
   *
   * Present only on a connected project. When it is here the player compiles
   * and renders it instead of drawing the prototype's chip stand-in — which is
   * what `viz` and `hot` are, and why they stay: a seeded scene has no module
   * and still has to render something.
   */
  componentSource?: string;
  /**
   * A stamped HyperFrames composition (HTML + one seekable GSAP timeline), the
   * render substrate replacing Remotion. Present only on a connected HyperFrames
   * scene, already resolved by the backend (data-duration + injected timing). The
   * player renders it in a sandboxed iframe seeked from the transport, in place of
   * `componentSource`.
   */
  compositionHtml?: string;
  /** The knobs that module declares, read from its manifest — never executed. */
  controls?: SceneControl[];
  /** URL of this beat's narration audio, present only once voice is generated. */
  audioUrl?: string;
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
  /** What the room looked at before answering — e.g. "Looked at the plan". */
  note?: string;
  /** True while this message's text is still streaming in (live agent output). */
  streaming?: boolean;
  /** A build-progress tick, rendered as a quiet status line, not as speech. */
  status?: boolean;
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

/** A scoped change the orchestrator proposes; nothing runs until Apply. */
export interface ProposedChange {
  tool: string;
  args: Record<string, string>;
  summary: string;
  changes: string;
  untouched: string;
  receipt: string;
}

/** One option in a clarifying question. `label` is sent back as the next turn. */
export interface ClarifyOption {
  label: string;
  detail: string;
}

/** Asked only when a request is too ambiguous to scope — a prompt + picks. */
export interface Clarification {
  prompt: string;
  options: ClarifyOption[];
}

/**
 * One turn of the side-chat orchestrator: a reply, and at most one of a scoped
 * proposal or a clarifying question. `observed` is what it looked at on demand.
 */
export interface OrchestratorTurn {
  reply: string;
  proposal: ProposedChange | null;
  question?: Clarification | null;
  observed?: string[];
}

/**
 * The choices the room asks for before a first build — they map one-to-one
 * onto the backend ProductionIntent enums, so the chat's chips and the stored
 * intent can never disagree about what the options are.
 */
export interface BuildOptions {
  audience: string;
  depth: "intuition_first" | "balanced" | "rigorous";
  target_duration_seconds: 60 | 180 | 300 | 600;
}

export type RenderState = "idle" | "rendering" | "done";

/** Downstream work that no longer matches the current scene source. */
export type StaleKind = "visual" | "assets" | "voice";
