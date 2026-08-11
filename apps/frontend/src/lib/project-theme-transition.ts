"use client";

import { flushSync } from "react-dom";
import type { TabId } from "@/lib/types";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

let transitionId = 0;

/** Dissolve the project shell only when navigation crosses the Edit theme. */
export function changeProjectStage(current: TabId, next: TabId, update: () => void) {
  if ((current === "edit") === (next === "edit")) {
    update();
    return;
  }

  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition) {
    update();
    return;
  }

  const id = ++transitionId;
  document.documentElement.dataset.projectThemeTransition = next === "edit" ? "dark" : "light";

  const transition = doc.startViewTransition(() => flushSync(update));
  void transition.finished.finally(() => {
    if (transitionId === id) delete document.documentElement.dataset.projectThemeTransition;
  });
}
