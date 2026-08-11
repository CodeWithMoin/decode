import type { TabId } from "@/lib/types";

/**
 * The four creative stages, declared once. Export is an action from Edit.
 *
 * Both shells render this list — the prototype's `ProjectShell` and the
 * connected `ConnectedProject`. They used to hold a copy each, one typed as
 * `TabId` and one as bare strings, which is fine while only Understanding is
 * connected and stops being fine the moment a second stage is.
 */
export const STAGES: { tab: TabId; label: string }[] = [
  { tab: "overview", label: "Understanding" },
  { tab: "plan", label: "Teaching Plan" },
  { tab: "script", label: "Script" },
  { tab: "edit", label: "Edit" },
];
