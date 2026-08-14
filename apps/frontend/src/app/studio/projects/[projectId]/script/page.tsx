import { ConnectedScript } from "@/components/connected/ConnectedScript";

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ConnectedScript projectId={projectId} />;
}
