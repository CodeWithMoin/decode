import type { Scene } from "@/lib/types";

export const DECODE_FPS = 24;

export interface DecodeTimelineClip {
  scene: Scene;
  sceneIndex: number;
  startFrame: number;
  durationInFrames: number;
  endFrame: number;
}

export interface DecodeTimelineManifest {
  clips: DecodeTimelineClip[];
  durationInFrames: number;
}

/** The frame-quantized sequence layout shared by the Player and editor timeline. */
export function getDecodeTimeline(scenes: Scene[]): DecodeTimelineManifest {
  let cursorSeconds = 0;
  const clips = scenes.map((scene, sceneIndex) => {
    const startFrame = Math.round(cursorSeconds * DECODE_FPS);
    cursorSeconds += scene.dur;
    const endFrame = Math.max(startFrame + 1, Math.round(cursorSeconds * DECODE_FPS));

    return {
      scene,
      sceneIndex,
      startFrame,
      durationInFrames: endFrame - startFrame,
      endFrame,
    };
  });

  return {
    clips,
    durationInFrames: Math.max(1, clips.at(-1)?.endFrame ?? 1),
  };
}
