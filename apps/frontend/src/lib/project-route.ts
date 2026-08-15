import type { StudioSnapshot } from "@/lib/types";

export function projectRoute(projectId: string, studio: StudioSnapshot): string {
  const job = studio.active_job ?? studio.most_recent_job;
  if (studio.current_stage === "processing" && job?.job_id) {
    // Voice is the one stage the workspace doesn't wait on: scenes already
    // exist, and Edit opens on them and polls the narration in as it lands
    // (ADR-005 locks each scene's length to its clip when it arrives). So a
    // running or failed voice job belongs in the cutting room, not on a
    // progress page — and it has no processing screen of its own anyway.
    if (job.kind === "generate_voice") {
      return `/studio/projects/${projectId}/edit`;
    }
    return `/studio/projects/${projectId}/jobs/${job.job_id}`;
  }

  const stage = {
    teaching_plan: "teaching-plan",
    script: "script",
    edit: "edit",
  }[studio.current_stage];

  return `/studio/projects/${projectId}/${stage ?? "understanding"}`;
}
