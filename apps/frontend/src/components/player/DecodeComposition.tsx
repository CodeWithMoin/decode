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
};

export function getDecodeDurationInFrames(scenes: Scene[]) {
  return getDecodeTimeline(scenes).durationInFrames;
}

export function DecodeComposition({ scenes, visualPick }: DecodeCompositionProps) {
  const timeline = getDecodeTimeline(scenes);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
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
