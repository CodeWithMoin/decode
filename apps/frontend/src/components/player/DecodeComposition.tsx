"use client";

import { Fragment } from "react";
// This host owns the production timeline. Generated scenes use the same Remotion
// clock through `@decode/animation-api`, but they do not register compositions or
// decide where they sit in the production.
import { Audio, Easing, interpolate, Sequence, useCurrentFrame } from "remotion";
import { AbsoluteFill, fontCss, Interactive } from "@decode/animation-api";
import { SceneVisual } from "@/components/project/canvas/SceneVisual";
import { GeneratedScene } from "@/components/player/GeneratedScene";
import { HyperframesScene } from "@/components/player/HyperframesScene";
import { DECODE_FPS, getDecodeTimeline } from "@/components/player/decode-timeline";
import { sceneVisualStyleAt } from "@/lib/scene-style";
import type { Scene } from "@/lib/types";

export { DECODE_FPS } from "@/components/player/decode-timeline";
export const DECODE_WIDTH = 1920;
export const DECODE_HEIGHT = 1080;
const SCENE_SEAM_FRAMES = 10;

export type DecodeCompositionProps = {
  scenes: Scene[];
  visualPick: Record<number, "A" | "B">;
  /** The Director's project palette. The host derives the one stage backdrop
   *  from it — generated once per project, behind every transparent scene. */
  palette?: import("@/lib/types").PlanPalette | null;
};

/** The production's one background. Painted here by the host — never by a
 *  scene — so the whole video reads as one film. A real designed ground, not a
 *  flat fill: a tinted base gradient, a gradient mesh in the Director's hues, a
 *  fine technical grid, film grain, and a vignette. Deterministic: derived only
 *  from the palette, fixed noise seed, no animation, settled at every frame. */
function StageBackdrop({ palette }: { palette?: import("@/lib/types").PlanPalette | null }) {
  const accent = palette?.accent ?? "#F2A47B";
  const support = palette?.support ?? "#8B93A7";
  const border = palette?.border ?? "#3A3A3A";
  const surface = palette?.surface ?? "#161616";
  // Fixed-seed fractal noise → film grain. A data URI keeps the render
  // self-contained (no fetch, byte-identical on every machine).
  const grain =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
        `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/>` +
        `<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0"/></filter>` +
        `<rect width="240" height="240" filter="url(#g)"/></svg>`,
    );
  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
      {/* The ground: a slow diagonal ramp out of the palette's surface hue, so
          the stage is that world's darkness rather than a generic black. */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${surface}66 0%, #0B0B0B 42%, #0B0B0B 62%, ${surface}4D 100%)`,
        }}
      />
      {/* The mesh: overlapping color fields in the project's own hues. Present
          enough to be seen, still a full step below content contrast. */}
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(1100px 750px at 14% 4%, ${accent}2E, transparent 68%)`,
            `radial-gradient(900px 650px at 96% 30%, ${support}1F, transparent 70%)`,
            `radial-gradient(1300px 850px at 78% 100%, ${accent}1A, transparent 72%)`,
            `radial-gradient(800px 600px at 4% 78%, ${support}24, transparent 70%)`,
            // Center lift keeps the picture zone a step above the edges.
            `radial-gradient(1500px 950px at 50% 46%, #FFFFFF07, transparent 74%)`,
          ].join(", "),
        }}
      />
      {/* The craft layer: a fine technical grid in the palette's border hue,
          faded out toward the edges so it reads as a drafting surface. */}
      <AbsoluteFill
        style={{
          backgroundImage: [
            `linear-gradient(${border}14 1px, transparent 1px)`,
            `linear-gradient(90deg, ${border}14 1px, transparent 1px)`,
          ].join(", "),
          backgroundSize: "96px 96px, 96px 96px",
          backgroundPosition: "center center",
          maskImage: "radial-gradient(120% 100% at 50% 46%, #000 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(120% 100% at 50% 46%, #000 30%, transparent 78%)",
        }}
      />
      {/* Film grain: kills banding in the gradients, gives the black some tooth. */}
      <AbsoluteFill
        style={{
          backgroundImage: `url("${grain}")`,
          backgroundRepeat: "repeat",
          mixBlendMode: "overlay",
          opacity: 0.5,
        }}
      />
      {/* Vignette: keeps eyes in the safe area, hides the frame's hard edge. */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(140% 110% at 50% 50%, transparent 58%, #00000080 100%)",
        }}
      />
    </AbsoluteFill>
  );
}

export function getDecodeDurationInFrames(scenes: Scene[]) {
  return getDecodeTimeline(scenes).durationInFrames;
}

export function DecodeComposition({ scenes, visualPick, palette }: DecodeCompositionProps) {
  const timeline = getDecodeTimeline(scenes);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
      <StageBackdrop palette={palette} />
      {timeline.clips.map(({ scene, sceneIndex, startFrame, durationInFrames }) => {
        if (scene.disabled) return null;
        const hasIncomingSeam = sceneIndex > 0 && !timeline.clips[sceneIndex - 1]?.scene.disabled;
        const hasOutgoingSeam = sceneIndex < timeline.clips.length - 1 && !timeline.clips[sceneIndex + 1]?.scene.disabled;
        const seamFrames = Math.min(SCENE_SEAM_FRAMES, Math.max(1, durationInFrames - 1));

        return (
          <Fragment key={scene.id}>
            {scene.audioUrl && !scene.muted && (
              <Sequence name={`Scene ${sceneIndex + 1} audio`} from={startFrame} durationInFrames={durationInFrames} premountFor={DECODE_FPS}>
                <Audio src={scene.audioUrl} />
              </Sequence>
            )}
            <Sequence
              name={`Scene ${sceneIndex + 1} visual`}
              from={startFrame}
              durationInFrames={durationInFrames + (hasOutgoingSeam ? seamFrames : 0)}
              premountFor={DECODE_FPS}
            >
              <DecodeScene
                scene={scene}
                index={sceneIndex}
                durationInFrames={durationInFrames}
                seamInFrames={hasIncomingSeam ? seamFrames : 0}
                seamOutFrames={hasOutgoingSeam ? seamFrames : 0}
                pick={visualPick[sceneIndex]}
              />
            </Sequence>
          </Fragment>
        );
      })}
    </AbsoluteFill>
  );
}

function DecodeScene({
  scene,
  index,
  durationInFrames,
  seamInFrames,
  seamOutFrames,
  pick,
}: {
  scene: Scene;
  index: number;
  durationInFrames: number;
  seamInFrames: number;
  seamOutFrames: number;
  pick?: "A" | "B";
}) {
  const frame = useCurrentFrame();
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 1)));
  const style = sceneVisualStyleAt(scene, progress);
  const fadeInFrames = Math.min(durationInFrames, Math.max(0, Math.round((scene.fadeIn ?? 0) * DECODE_FPS)));
  const fadeOutFrames = Math.min(durationInFrames - fadeInFrames, Math.max(0, Math.round((scene.fadeOut ?? 0) * DECODE_FPS)));
  const fadeInOpacity = fadeInFrames > 0
    ? interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const fadeOutOpacity = fadeOutFrames > 0
    ? interpolate(frame, [durationInFrames - fadeOutFrames - 1, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const seamIn = seamInFrames > 0
    ? interpolate(frame, [0, seamInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.poly(4)),
      })
    : 1;
  const seamOut = seamOutFrames > 0
    ? interpolate(frame, [durationInFrames, durationInFrames + seamOutFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.poly(4)),
      })
    : 0;
  const seamOpacity = Math.min(1, seamIn * 0.65 + 0.35) * (1 - seamOut * 0.85);
  const seamX = (1 - seamIn) * 230 - seamOut * 230;
  const seamBlur = Math.max((1 - seamIn) * 8, seamOut * 8);
  const opacity = Math.min(fadeInOpacity, fadeOutOpacity) * seamOpacity;

  // A connected scene brings its own animation as code. Everything below is the
  // prototype's chip stand-in for a visual that does not exist yet, so a scene
  // that has the real thing skips it.
  const hostStyle: React.CSSProperties = {
    translate: `${style.x + seamX}px ${style.y}px`,
    scale: style.scale / 100,
    opacity: opacity * (style.opacity / 100),
    filter: style.blur + seamBlur > 0 ? `blur(${style.blur + seamBlur}px)` : undefined,
  };

  // A HyperFrames scene is the render substrate replacing Remotion: play its
  // stamped composition, seeked to this scene's local time. Legacy React scenes
  // keep Remotion until they are migrated.
  if (scene.compositionHtml)
    return (
      <AbsoluteFill style={hostStyle}>
        <HyperframesScene scene={scene} timeSeconds={frame / DECODE_FPS} />
      </AbsoluteFill>
    );

  if (scene.componentSource) return <AbsoluteFill style={hostStyle}><GeneratedScene scene={scene} /></AbsoluteFill>;

  return <AbsoluteFill style={hostStyle}><SeededScene scene={scene} index={index} durationInFrames={durationInFrames} pick={pick} /></AbsoluteFill>;
}

function SeededScene({ scene, index, durationInFrames, pick }: { scene: Scene; index: number; durationInFrames: number; pick?: "A" | "B" }) {
  const frame = useCurrentFrame();
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 1)));
  const style = sceneVisualStyleAt(scene, progress);
  const font = fontCss({ family: style.font, weight: style.weight });

  return (
    <AbsoluteFill
      name="Scene"
      style={
        {
          backgroundColor: style.backgroundColor,
          color: style.textColor,
          fontFamily: font.fontFamily,
          "--color-canvas-chip": "#1C1C1C",
          "--color-canvas-line": "#303030",
          "--color-canvas-chip-fg": style.secondaryColor,
          "--color-accent-lit": style.accentColor,
          "--accent": style.accentColor,
          "--scene-ink": style.secondaryColor,
          "--scene-dim": style.secondaryColor,
          "--scene-cap": style.textColor,
          "--font-mono": font.fontFamily,
        } as React.CSSProperties
      }
    >
      <Interactive.Div
        name="Scene content"
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          padding: "68px 84px 54px",
        }}
      >
        <Interactive.Div
          name="Scene label"
          style={{
            flex: "none",
            color: "#707070",
            fontFamily: "var(--font-geist-mono)",
            fontSize: 30,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Scene {String(index + 1).padStart(2, "0")} · {scene.title}
        </Interactive.Div>

        <Interactive.Div name="Scene visual" style={{ width: "100%", minHeight: 0, flex: 1, marginTop: 28 }}>
          <SceneVisual scene={scene} p={progress} pick={pick} />
        </Interactive.Div>

        <Interactive.Div name="Visual labels" style={{ display: "flex", maxWidth: "92%", flex: "none", justifyContent: "center", gap: 14 }}>
          {scene.viz.map((label, labelIndex) => (
            <div
              key={`${scene.id}-${label}-${labelIndex}`}
              style={{
                minWidth: 0,
                overflow: "hidden",
                border: `1px solid ${labelIndex === scene.hot ? style.accentColor : "#303030"}`,
                borderRadius: 12,
                backgroundColor: labelIndex === scene.hot ? style.accentColor : "#1C1C1C",
                color: labelIndex === scene.hot ? "#FFFFFF" : style.secondaryColor,
                padding: "16px 24px",
                fontFamily: font.fontFamily,
                fontSize: 36,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          ))}
        </Interactive.Div>

        <Interactive.Div
          name="Caption"
          style={{
            maxWidth: "74%",
            flex: "none",
            marginTop: 28,
            color: style.textColor,
            fontFamily: font.fontFamily,
            fontSize: style.size * 3.2,
            fontWeight: style.weight,
            lineHeight: 1.16,
            textAlign: "center",
          }}
        >
          {scene.caption}
        </Interactive.Div>

        <Interactive.Div
          name="Format label"
          style={{
            alignSelf: "flex-end",
            flex: "none",
            marginTop: 28,
            color: "#5F5F5F",
            fontFamily: "var(--font-geist-mono)",
            fontSize: 28,
          }}
        >
          1920 × 1080 · 24 fps
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
}
