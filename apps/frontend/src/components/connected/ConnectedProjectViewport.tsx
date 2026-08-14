"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useProjectViewportLock } from "@/lib/use-project-viewport-lock";
import type { StudioSnapshot } from "@/lib/types";

type ProjectSnapshotContextValue = {
  snapshot: StudioSnapshot | null;
  setSnapshot: (snapshot: StudioSnapshot) => void;
};

const ProjectSnapshotContext = createContext<ProjectSnapshotContextValue | null>(null);

export function useConnectedProjectSnapshot() {
  const context = useContext(ProjectSnapshotContext);
  if (!context) throw new Error("useConnectedProjectSnapshot must be used inside a connected project layout");
  return context;
}

/** Keep the viewport lock mounted while routed project stages replace each other. */
export function ConnectedProjectViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  useProjectViewportLock(!pathname.includes("/jobs/"));
  return (
    <ProjectSnapshotContext.Provider value={{ snapshot, setSnapshot }}>
      {children}
    </ProjectSnapshotContext.Provider>
  );
}
