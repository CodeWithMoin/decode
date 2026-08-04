import { ConnectedProcessing } from "@/components/connected/ConnectedProcessing";

export default async function JobPage({
  params,
}: {
  params: Promise<{ projectId: string; jobId: string }>;
}) {
  const { projectId, jobId } = await params;
  return <ConnectedProcessing projectId={projectId} jobId={jobId} />;
}
