import { ConnectedEdit } from "@/components/connected/ConnectedEdit";

export default async function EditPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ConnectedEdit projectId={projectId} />;
}
