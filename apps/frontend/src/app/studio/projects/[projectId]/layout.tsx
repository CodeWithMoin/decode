import type { ReactNode } from "react";
import { ConnectedProjectViewport } from "@/components/connected/ConnectedProjectViewport";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return <ConnectedProjectViewport>{children}</ConnectedProjectViewport>;
}
