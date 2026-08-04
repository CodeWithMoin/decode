import { ConnectedProject } from "@/components/connected/ConnectedProject";

export default async function UnderstandingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ConnectedProject projectId={projectId} />;
}
