import type { Scene, SceneFont, SceneKeyframeProperty, SceneVisualStyle } from "@/lib/types";

export const DEFAULT_SCENE_VISUAL_STYLE: SceneVisualStyle = {
  font: "Space Grotesk",
  weight: 600,
  size: 22,
  textColor: "#F5F5F5",
  secondaryColor: "#B8B8B8",
  accentColor: "#D4551C",
  backgroundColor: "#0B0B0B",
  x: 0,
  y: 0,
  scale: 100,
  opacity: 100,
  blur: 0,
};

export const SCENE_FONTS: SceneFont[] = [
  "Space Grotesk",
  "Inter",
  "Bricolage Grotesque",
  "Geist Mono",
];

export function sceneVisualStyle(scene: Scene): SceneVisualStyle {
  return { ...DEFAULT_SCENE_VISUAL_STYLE, ...scene.visualStyle };
}

export function sceneVisualStyleAt(scene: Scene, progress: number): SceneVisualStyle {
  const style = sceneVisualStyle(scene);
  const animated = { ...style };
  for (const property of ["size", "x", "y", "scale", "opacity", "blur"] as const) {
    animated[property] = keyframedValue(scene, property, style[property], progress);
  }
  return animated;
}

export function keyframedValue(scene: Scene, property: SceneKeyframeProperty, base: number, progress: number) {
  const points = [...(scene.visualKeyframes?.[property] ?? [])].sort((a, b) => a.at - b.at);
  if (points.length === 0) return base;
  if (progress <= points[0].at) {
    if (points[0].at === 0) return points[0].value;
    const amount = Math.max(0, progress) / points[0].at;
    return base + (points[0].value - base) * amount;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (progress <= next.at) {
      const amount = (progress - previous.at) / Math.max(0.000001, next.at - previous.at);
      return previous.value + (next.value - previous.value) * amount;
    }
  }
  return points[points.length - 1].value;
}

