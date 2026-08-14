"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { Graphite, Spinner } from "@/components/ui/primitives";
import { creatorError } from "@/lib/creator-errors";
import { decodeApi } from "@/lib/decode-api";
import { projectRoute } from "@/lib/project-route";

export function ConnectedProjectResume({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    decodeApi.getStudio(projectId)
      .then((studio) => {
        if (active) router.replace(projectRoute(projectId, studio));
      })
      .catch((cause: unknown) => {
        if (active) setError(creatorError(cause, "We couldn’t open this project."));
      });
    return () => { active = false; };
  }, [attempt, projectId, router]);

  return (
    <AppShell active="none" connected>
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="studio-shell w-full max-w-[520px]">
          <div className="studio-surface p-7 text-center">
            {error ? (
              <>
                <span className="studio-eyebrow">Project unavailable</span>
                <h1 className="mt-4 font-display text-[28px] font-semibold tracking-[-0.035em] text-ink">We couldn’t resume this decode</h1>
                <p role="alert" className="mt-3 text-[13px] leading-[1.65] text-t6">{error}</p>
                <Graphite onClick={() => { setError(""); setAttempt((value) => value + 1); }} className="mt-5 px-4 py-2 text-[12.5px]">Try again</Graphite>
              </>
            ) : (
              <div className="flex items-center justify-center gap-3 text-[13px] text-t6">
                <Spinner size={15} />
                Resuming the latest production stage…
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
