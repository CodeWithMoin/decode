import type { StudioSnapshot } from "@/lib/types";

export function projectRoute(projectId: string, studio: StudioSnapshot): string {
  const job = studio.active_job ?? studio.most_recent_job;
  if (studio.current_stage === "processing" && job?.job_id) {
    return `/studio/projects/${projectId}/jobs/${job.job_id}`;
  }

  const stage = {
    teaching_plan: "teaching-plan",
    script: "script",
    edit: "edit",
  }[studio.current_stage];

  return `/studio/projects/${projectId}/${stage ?? "understanding"}`;
}
