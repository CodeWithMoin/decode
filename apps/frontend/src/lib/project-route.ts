import type { StudioSnapshot } from "@/lib/types";

/**
 * v1: every project is a video, and the pipeline builds it automatically.
 *
 * The backend auto-advances the whole run (brief → plan → script → scenes →
 * voice) with auto-approval (`Project.auto_continue`, on by default), so there
 * are no stage-approval screens to route through. Every project lands in the
 * workspace, which progressively hydrates the build and then plays the video.
 * The staged Understanding / Teaching Plan / Script routes still exist for
 * deep-links, but nothing sends a creator to them.
 *
 * `studio` is kept in the signature for the callers that pass it; the landing
 * screen no longer depends on the stage.
 */
export function projectRoute(projectId: string, _studio: StudioSnapshot): string {
  return `/studio/projects/${projectId}/edit`;
}
