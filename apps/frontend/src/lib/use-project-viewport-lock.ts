"use client";

import { useEffect } from "react";

/** Keep project scrolling inside its panels so the document never rubber-bands. */
export function useProjectViewportLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !window.matchMedia("(min-width: 1024px)").matches) return;

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overscrollBehavior = previous.bodyOverscroll;
    };
  }, [enabled]);
}
