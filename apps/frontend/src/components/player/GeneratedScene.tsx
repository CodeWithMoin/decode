"use client";

import { useEffect, useState } from "react";
import { AbsoluteFill } from "@decode/animation-api";
import { loadSceneModule, SceneModuleError, type SceneComponent } from "@/lib/scene-module";
import { useStudio } from "@/store/studio";
import type { Scene } from "@/lib/types";

/**
 * One beat's generated animation, compiled and rendered.
 *
 * Sequencing, duration and placement are not this component's business —
 * DecodeComposition already owns all of that, and a scene never learns its own
 * length. This only turns source into pixels.
 *
 * A scene that fails to load must not take the preview down with it: the rest
 * of the cut is still watchable, and the creator needs to see which beat is
 * broken rather than a blank frame.
 */
export function GeneratedScene({ scene }: { scene: Scene }) {
  const source = scene.componentSource ?? "";
  const overrides = useStudio((s) => s.controlValues[scene.id]);
  const [Component, setComponent] = useState<SceneComponent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setComponent(null);
    setError("");
    loadSceneModule(source)
      .then((loaded) => {
        if (live) setComponent(() => loaded);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setError(
          cause instanceof SceneModuleError
            ? [cause.message, cause.detail].filter(Boolean).join(" ")
            : "This scene could not be loaded.",
        );
      });
    return () => {
      live = false;
    };
  }, [source]);

  if (error) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0B0B0B",
          color: "#F0B199",
          display: "grid",
          placeItems: "center",
          padding: 64,
          textAlign: "center",
          fontSize: 28,
          lineHeight: 1.4,
        }}
      >
        {error}
      </AbsoluteFill>
    );
  }

  // Not a spinner: an uncompiled scene is a held black frame, and the checklist
  // outside the player is what reports progress.
  if (!Component) return <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }} />;

  return <Component {...controlProps(scene, overrides)} />;
}

/**
 * The module's declared controls as props — the Inspector's live value where
 * one exists, the declared default otherwise.
 *
 * Read off the declared list rather than by executing the module — the same
 * reason Decode serialises that block itself, so the settings panel and the
 * preview cannot disagree about what knobs exist.
 */
function controlProps(
  scene: Scene,
  overrides: Record<string, string | number | boolean> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    (scene.controls ?? []).map((c) => [c.name, overrides?.[c.name] ?? c.default]),
  );
}
