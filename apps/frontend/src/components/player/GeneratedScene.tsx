"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { AbsoluteFill } from "@decode/animation-api";
import { loadSceneModule, SceneModuleError, type SceneComponent } from "@/lib/scene-module";
import { useStudio } from "@/store/studio";
import type { Scene } from "@/lib/types";

/**
 * One beat's generated animation, compiled and rendered.
 *
 * Sequencing, duration and placement are not this component's business —
 * DecodeComposition owns all of that. A scene may read its enclosing Sequence's
 * frame clock, but it cannot register or reposition the production. This only
 * turns source into pixels.
 *
 * A scene that fails to load must not take the preview down with it: the rest
 * of the cut is still watchable, and the creator needs to see which beat is
 * broken rather than a blank frame.
 */
export function GeneratedScene({ scene }: { scene: Scene }) {
  const source = scene.componentSource ?? "";
  const overrides = useStudio((s) => s.controlValues[scene.id]);
  return <GeneratedSceneSource key={source} scene={scene} source={source} overrides={overrides} />;
}

function GeneratedSceneSource({
  scene,
  source,
  overrides,
}: {
  scene: Scene;
  source: string;
  overrides: Record<string, string | number | boolean> | undefined;
}) {
  const [Component, setComponent] = useState<SceneComponent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
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
    return <SceneError message={error} />;
  }

  // Not a spinner: an uncompiled scene is a held black frame, and the checklist
  // outside the player is what reports progress.
  if (!Component) return <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }} />;

  return (
    <SceneRenderBoundary key={source}>
      <Component {...controlProps(scene, overrides)} />
    </SceneRenderBoundary>
  );
}

class SceneRenderBoundary extends Component<
  { children: ReactNode },
  { message: string }
> {
  state = { message: "" };

  static getDerivedStateFromError(cause: unknown) {
    return {
      message: cause instanceof Error ? cause.message : "This scene could not be rendered.",
    };
  }

  render() {
    return this.state.message
      ? <SceneError message={`This scene could not render. ${this.state.message}`} />
      : this.props.children;
  }
}

function SceneError({ message }: { message: string }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B0B0B",
        display: "grid",
        placeItems: "center",
        padding: 96,
      }}
    >
      <div
        style={{
          width: "min(860px, 100%)",
          border: "1px solid #303030",
          borderRadius: 18,
          backgroundColor: "#111111",
          padding: "48px 52px 52px",
          boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.035)",
        }}
      >
        <div
          style={{
            color: "#F2A47B",
            fontFamily: "ui-monospace, monospace",
            fontSize: 18,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Scene unavailable
        </div>
        <div
          style={{
            marginTop: 18,
            color: "#F5F5F5",
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.25,
          }}
        >
          This scene could not open in the player.
        </div>
        <div
          style={{
            marginTop: 16,
            color: "#B8B8B8",
            fontSize: 22,
            lineHeight: 1.55,
          }}
        >
          The rest of the cut is safe. Direct this scene to rebuild only this visual, then review it again.
        </div>
        <div
          style={{
            marginTop: 24,
            color: "#7E7E7E",
            fontFamily: "ui-monospace, monospace",
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      </div>
    </AbsoluteFill>
  );
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
