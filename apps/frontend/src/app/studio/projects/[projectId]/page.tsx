import { ConnectedProjectResume } from "@/components/connected/ConnectedProjectResume";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ConnectedProjectResume projectId={projectId} />;
}
