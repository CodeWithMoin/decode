"use client";

// Sequence and the frame clock come straight from Remotion here, not from
// `@decode/animation-api`. That module is the door a *generated scene* comes
// through, and it deliberately withholds the clock so a scene cannot learn its
// own duration. This file is the host that lays scenes out on the real
// timeline, so it is exactly the code that should have frames.
import { Sequence, useCurrentFrame } from "remotion";
import { AbsoluteFill, fontCss, Interactive } from "@decode/animation-api";
import { SceneVisual } from "@/components/project/canvas/SceneVisual";
import { sceneVisualStyleAt } from "@/lib/scene-style";
import type { Scene } from "@/lib/types";

export const DECODE_FPS = 24;
export const DECODE_WIDTH = 1920;
export const DECODE_HEIGHT = 1080;

export type DecodeCompositionProps = {
  scenes: Scene[];
  visualPick: Record<number, "A" | "B">;
};

export function getDecodeDurationInFrames(scenes: Scene[]) {
  const dur = scenes.reduce((a, s) => a + s.dur, 0);
  return Math.max(1, Math.round(dur * DECODE_FPS));
}

export function DecodeComposition({ scenes, visualPick }: DecodeCompositionProps) {
  const sceneStarts: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    sceneStarts.push(Math.round(acc * DECODE_FPS));
    acc += s.dur;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
      {scenes.map((scene, index) => {
        const durationInFrames = Math.max(1, scene.dur * DECODE_FPS);
        const start = sceneStarts[index];

        const blank = scene.disabled;

        if (blank) {
          return (
            <Sequence key={scene.id} name={`Scene ${index + 1}`} from={start} durationInFrames={durationInFrames}>
              <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }} />
            </Sequence>
          );
        }

        return (
          <Sequence key={scene.id} name={`Scene ${index + 1}`} from={start} durationInFrames={durationInFrames} premountFor={DECODE_FPS}>
            <DecodeScene scene={scene} index={index} durationInFrames={durationInFrames} pick={visualPick[index]} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function DecodeScene({ scene, index, durationInFrames, pick }: { scene: Scene; index: number; durationInFrames: number; pick?: "A" | "B" }) {
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
          translate: `${style.x}% ${style.y}%`,
          scale: style.scale / 100,
          opacity: style.opacity / 100,
          filter: style.blur > 0 ? `blur(${style.blur}px)` : undefined,
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
