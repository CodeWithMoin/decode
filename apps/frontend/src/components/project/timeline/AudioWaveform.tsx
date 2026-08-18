"use client";

import { useEffect, useRef } from "react";
import { drawBars, loadWaveformPeaks } from "@remotion/timeline-utils";

export function AudioWaveform({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new AbortController();
    let peaks: Float32Array | null = null;

    const draw = () => {
      if (!peaks) return;
      const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
      const height = Math.max(1, Math.round(canvas.getBoundingClientRect().height));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const color = getComputedStyle(canvas).getPropertyValue("--nle-audio-waveform").trim();
      drawBars({ canvas, color: color || "#DCE8E2", peaks, volume: 2.5, width });
    };

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    void loadWaveformPeaks(src, controller.signal, {
      onProgress: (progress) => {
        peaks = progress.peaks;
        draw();
      },
    }).then((loaded) => {
      peaks = loaded;
      draw();
    }).catch(() => undefined);

    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-x-1 bottom-1 h-[22px] w-[calc(100%_-_0.5rem)] opacity-90"
      aria-hidden
    />
  );
}
