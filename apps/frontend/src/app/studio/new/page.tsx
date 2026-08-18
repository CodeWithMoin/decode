import { NewProjectRedirect } from "@/components/screens/upload/NewProjectRedirect";

// v1: no upload form. A new decode is a blank project, created instantly and
// directed in the Edit chat. The old NewDecode form is kept for reference/deep
// use but is no longer the entry point.
export default function NewDecodePage() {
  return <NewProjectRedirect />;
}
