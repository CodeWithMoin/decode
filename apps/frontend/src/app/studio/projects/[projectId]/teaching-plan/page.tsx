import { ConnectedTeachingPlan } from "@/components/connected/ConnectedTeachingPlan";

export default async function TeachingPlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ConnectedTeachingPlan projectId={projectId} />;
}
