"use client";

import { useEffect, useRef } from "react";
import lottie from "lottie-web";
import animationData from "@/assets/thinking.json";

/**
 * The Apple "Image Playground" sparkle, rendered as a Lottie — the room's
 * thinking indicator. Replaces the spinner; the text label stays beside it so
 * it is never a bare loading state. Decorative: a reduced-motion user gets a
 * single static frame instead of a looping sparkle.
 */
export function ThinkingSparkle({ size = 18 }: { size?: number }) {
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = lottie.loadAnimation({
      container: node,
      renderer: "svg",
      loop: true,
      autoplay: !reduced,
      animationData,
    });
    return () => animation.destroy();
  }, []);

  return <div ref={nodeRef} aria-hidden style={{ width: size, height: size }} />;
}
