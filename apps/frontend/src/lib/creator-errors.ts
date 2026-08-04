import { DecodeApiError } from "./decode-api";

const PROBLEM_MESSAGES: Record<string, string> = {
  artifact_version_conflict:
    "Someone saved a newer draft while you were editing. Your changes are still here.",
  idempotency_conflict:
    "This action changed while it was being saved. Refresh the page and try again.",
  invalid_command:
    "Decode couldn’t use those project details. Refresh the page and try again.",
  object_store_unavailable:
    "Your source couldn’t be uploaded right now. Your draft is safe—please try again.",
  project_not_found: "We couldn’t find this project. Return to the studio and open it again.",
  run_already_active: "Decode is already trying this step again.",
  source_too_large: "That source is too large to upload. Try a file smaller than 25 MB.",
  unsupported_source_type:
    "Decode can’t read that file type yet. Try a PDF, Markdown file, document, or plain text.",
  upload_in_progress: "That source is still uploading. Wait a moment and try again.",
  validation_failed: "Some project details need your attention before Decode can continue.",
};

export function creatorError(error: unknown, fallback: string): string {
  if (error instanceof DecodeApiError) {
    return PROBLEM_MESSAGES[error.problem.code] ?? fallback;
  }
  if (error instanceof TypeError) {
    return "Decode couldn’t connect. Check your connection and try again.";
  }
  return fallback;
}
