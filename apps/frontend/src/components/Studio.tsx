"use client";

import { Landing } from "@/components/screens/landing/Landing";
import { ProjectShell } from "@/components/project/ProjectShell";
import { Dashboard } from "@/components/screens/dashboard/Dashboard";
import { NewDecode } from "@/components/screens/upload/NewDecode";
import { Processing } from "@/components/screens/processing/Processing";
import { StageKicker } from "@/components/ui/primitives";
import { useStudio } from "@/store/studio";

/**
 * Screen router.
 *
 * Landing → Dashboard → New Decode → Processing → Project. The production
 * room is project-scoped because its context and proposed changes only make
 * sense once a decode is open.
 */
export function Studio() {
  const screen = useStudio((s) => s.screen);

  switch (screen) {
    case "landing":
      return <Landing />;
    case "dashboard":
      return <Dashboard />;
    case "upload":
      return <NewDecode />;
    case "processing":
      return <Processing />;
    case "project":
      // ProjectShell mounts the production room itself, so it must not be
      // double-mounted here.
      return <ProjectShell />;
    default:
      return <NotYet />;
  }
}

function NotYet() {
  const go = useStudio((s) => s.go);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#F3F3F1,#EBEBE9)]">
      <div className="text-center">
        <StageKicker className="mb-2">In production</StageKicker>
        <div className="mb-4 font-display text-2xl font-semibold">
          The studio is being built.
        </div>
        <button
          onClick={() => go("landing")}
          className="rounded-full border border-line bg-card px-4 py-2 text-[13px] text-t6 transition-colors hover:border-line-strong hover:text-ink"
        >
          ← Back to the landing page
        </button>
      </div>
    </div>
  );
}
