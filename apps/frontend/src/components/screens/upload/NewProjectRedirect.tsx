"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { decodeApi, idempotencyKey } from "@/lib/decode-api";
import { Spinner } from "@/components/ui/primitives";

/**
 * v1 entry: a new decode is a blank project, directed in chat.
 *
 * No upload form and no knobs — creating a project is instant, and the topic
 * ("explain backprop") is the first thing the creator types into the Edit chat,
 * which kicks the build. This just makes the project and hands off to Edit.
 */
export function NewProjectRedirect() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    decodeApi
      .createProject(undefined, idempotencyKey())
      .then((project) => router.replace(`/studio/projects/${project.project_id}/edit`))
      .catch(() => router.replace("/studio"));
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--color-canvas)]">
      <Spinner size={18} />
      <span className="font-mono text-[10px] tracking-[0.12em] text-t8 uppercase">
        Creating your project…
      </span>
    </div>
  );
}
