"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { continueRender, delayRender } from "remotion";
import { AbsoluteFill, inspectScene } from "@decode/animation-api";
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
  // The module compiles asynchronously; a headless render (stills for the
  // vision gate, the export) captures the frame as soon as the page settles,
  // so without delayRender it screenshots the pre-compile black stage.
  const [renderHandle] = useState(() => delayRender(`compile scene ${scene.id}`));

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
      })
      .finally(() => continueRender(renderHandle));
    return () => {
      live = false;
    };
  }, [source, renderHandle]);

  if (error) {
    return <SceneError message={error} />;
  }

  // A briefly-compiling scene is a held black frame; one that stays black is
  // indistinguishable from a broken one, so after a moment it says what it is —
  // the connected workspace renders no checklist that could explain it instead.
  if (!Component) return <SceneCompiling />;

  return (
    <SceneRenderBoundary key={source}>
      <LayoutInspection sceneId={scene.id}>
        <Component {...controlProps(scene, overrides)} script={scene.script} words={scene.words} />
      </LayoutInspection>
    </SceneRenderBoundary>
  );
}

/**
 * Runs the animation-api's layout inspector against the mounted scene while it
 * plays, so a collision or overflow the static gate cannot see (it needs real
 * text metrics) surfaces as a warning instead of shipping silently. Findings
 * are deduped per scene; the DOM walk is small and paced, not per-frame.
 */
function LayoutInspection({ sceneId, children }: { sceneId: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reported = new Set<string>();
    // Coverage is judged over several samples, not one: a staged reveal is
    // legitimately sparse at frame 0, so only a scene that never fills the
    // stage earns the warning.
    let samples = 0;
    let bestX = 0;
    let bestY = 0;
    const inspect = () => {
      if (!root.current) return;
      const { findings, coverageX, coverageY } = inspectScene(root.current);
      for (const finding of findings) {
        const key = `${finding.code}:${finding.message}`;
        if (reported.has(key)) continue;
        reported.add(key);
        console.warn(`[decode] scene ${sceneId} layout: ${finding.message}`, finding);
      }
      samples += 1;
      bestX = Math.max(bestX, coverageX);
      bestY = Math.max(bestY, coverageY);
      if (samples === 8 && (bestX < 0.5 || bestY < 0.4) && !reported.has("low_coverage")) {
        reported.add("low_coverage");
        console.warn(
          `[decode] scene ${sceneId} layout: content never spans the stage ` +
            `(peak coverage ${Math.round(bestX * 100)}% x ${Math.round(bestY * 100)}%) — `
            + "it reads as a miniature in an empty frame.",
        );
      }
    };
    const timer = setInterval(inspect, 800);
    return () => clearInterval(timer);
  }, [sceneId]);

  return (
    <div ref={root} style={{ position: "absolute", inset: 0 }}>
      {children}
    </div>
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

/**
 * Black for the first beat (a fast compile never flashes UI), then a named
 * state — "nothing is a bare loading state" applies to held black frames too.
 */
function SceneCompiling() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <AbsoluteFill
      style={{ backgroundColor: "#0B0B0B", display: "grid", placeItems: "center" }}
    >
      {slow && (
        <div
          style={{
            color: "#7E7E7E",
            fontFamily: "ui-monospace, monospace",
            fontSize: 18,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Preparing this scene…
        </div>
      )}
    </AbsoluteFill>
  );
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
