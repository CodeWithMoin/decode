"use client";

import { Component, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
        <SafeArea>
          <Component {...controlProps(scene, overrides)} script={scene.script} words={scene.words} />
        </SafeArea>
      </LayoutInspection>
    </SceneRenderBoundary>
  );
}

// The 1920x1080 broadcast frame and its 96px safe margin (MASTER.md).
const FRAME_W = 1920, FRAME_H = 1080, SAFE_MARGIN = 96;
const SAFE_W = FRAME_W - 2 * SAFE_MARGIN, SAFE_H = FRAME_H - 2 * SAFE_MARGIN;
const q6 = (n: number) => Math.round(n * 64) / 64; // match the renderer quantizer

/**
 * The host-owned SafeArea guarantee (spike: spikes/auto-repair). After the scene
 * mounts, measure its real leaf geometry once and apply ONE rigid transform —
 * scale-to-fit plus translate — to the whole scene so nothing sits past the 96px
 * margin. Because every node moves by the same affine transform, all internal
 * structure, spacing and aspect ratios are mathematically invariant: it can only
 * shrink an over-large scene, never break a valid one. Overflow is a global
 * containment concern the host solves deterministically; sibling spacing stays a
 * composition concern (Stack/Row/Grid) and the vision gate.
 *
 * One measurement is correct: choreography reveals elements by opacity, so every
 * element occupies its final layout slot from frame 0 — the content box is stable
 * across the scene. We measure the untransformed content, then apply; the effect
 * runs once (no feedback loop), and a delayRender holds a headless capture until
 * the transform is committed so stills and the export match the preview.
 */
function SafeArea({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const palette = useStudio((s) => s.stagePalette);
  const [fit, setFit] = useState<{ s: number; dx: number; dy: number } | null>(null);
  const [handle] = useState(() => delayRender("safe-area fit"));

  // The Director's palette, stamped once as CSS variables the scene primitives
  // read (var(--decode-surface|border|ink|support|accent)). No scene component
  // hardcodes a colour — every hue flows from here. When a project has no
  // palette the variables are unset and each primitive falls back to its own
  // dark default (never the brand amber). surface-deep is the quiet diagram
  // surface, kept distinct from surface per the scene-visual contract.
  const paletteVars = (palette
    ? {
        "--decode-surface": palette.surface,
        "--decode-surface-deep": `color-mix(in srgb, ${palette.surface} 78%, #000)`,
        "--decode-border": palette.border,
        "--decode-ink": palette.ink,
        "--decode-support": palette.support,
        "--decode-accent": palette.accent,
      }
    : {}) as CSSProperties;

  useLayoutEffect(() => {
    const stage = stageRef.current, content = contentRef.current;
    // Any path must resolve to a fit so the delayRender handle continues and a
    // headless capture never hangs.
    if (!stage || !content) { setFit({ s: 1, dx: 0, dy: 0 }); return; }
    const sr = stage.getBoundingClientRect();
    if (sr.width < 1) { setFit({ s: 1, dx: 0, dy: 0 }); return; }
    const pxToComp = FRAME_W / sr.width; // the stage renders 1920 comp px at sr.width screen px
    // Measure the GROUP boxes (Stack/Row/Grid), never the leaf Subjects. A leaf's
    // `appear` animates transform: scale(), and getBoundingClientRect includes
    // transforms — an unappeared card at scale(0) would measure ~0 and hide the
    // true extent. Groups aren't scaled and their flex slots reserve full size
    // regardless of reveal state, so their union is the stable layout bbox.
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    const groups = content.querySelectorAll('[data-decode-box="group"]');
    const targets = groups.length ? groups : content.querySelectorAll("[data-decode-box]");
    for (const el of targets) {
      const r = (el as HTMLElement).getBoundingClientRect();
      const x = (r.left - sr.left) * pxToComp, y = (r.top - sr.top) * pxToComp;
      const w = r.width * pxToComp, h = r.height * pxToComp;
      if (w < 4 || h < 4) continue;
      if (w >= FRAME_W - 4 && h >= FRAME_H - 4) continue; // skip the full-frame root
      L = Math.min(L, x); T = Math.min(T, y); R = Math.max(R, x + w); B = Math.max(B, y + h);
    }
    if (!isFinite(L)) { setFit({ s: 1, dx: 0, dy: 0 }); return; }
    const bw = R - L, bh = B - T;
    const s = Math.min(1, SAFE_W / bw, SAFE_H / bh);
    // scaled bbox, then translate it fully inside the safe rect
    const cx = L + bw / 2, cy = T + bh / 2;
    const sx = cx - (bw * s) / 2, sy = cy - (bh * s) / 2, sw = bw * s, sh = bh * s;
    const tx = sx < SAFE_MARGIN ? SAFE_MARGIN - sx : sx + sw > SAFE_MARGIN + SAFE_W ? SAFE_MARGIN + SAFE_W - (sx + sw) : 0;
    const ty = sy < SAFE_MARGIN ? SAFE_MARGIN - sy : sy + sh > SAFE_MARGIN + SAFE_H ? SAFE_MARGIN + SAFE_H - (sy + sh) : 0;
    // combined transform about origin 0,0: x' = s*x + (cx*(1-s)+tx)
    setFit({ s: q6(s), dx: q6(cx * (1 - s) + tx), dy: q6(cy * (1 - s) + ty) });
  }, []);

  // Continue a headless capture only once the transform is committed, so stills
  // and the export render the corrected frame, not the pre-fit one. Continue
  // exactly once — and, if the scene errors before the measurement runs, on
  // unmount too, so a crashing scene never hangs the render on a stuck
  // delayRender for the full timeout.
  const continued = useRef(false);
  const release = () => {
    if (!continued.current) {
      continued.current = true;
      continueRender(handle);
    }
  };
  useEffect(() => {
    if (fit) release();
  }, [fit, handle]);
  useEffect(() => () => release(), [handle]);

  return (
    <div
      ref={stageRef}
      style={{ position: "absolute", inset: 0, ...paletteVars }}
    >
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: fit ? `translate(${fit.dx}px, ${fit.dy}px) scale(${fit.s})` : undefined,
        }}
      >
        {children}
      </div>
    </div>
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
            color: "#4b8ea1",
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
