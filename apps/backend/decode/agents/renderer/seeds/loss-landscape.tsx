// SEED · loss-landscape — an optimization landscape: contour rings (the bowl) with a gradient-descent path stepping downhill to the minimum. Edit the PATH (normalized 0..1, start → minimum).
// Composes LossLandscape. Keep the contours-then-walk reveal; change the descent PATH
// (normalized points from the start to the minimum) and the colour.
import {
  AbsoluteFill,
  LossLandscape,
  Label,
  tokens,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  EASE_PRESETS,
} from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}

// Steps shrinking toward the minimum at the centre (0.5, 0.5).
const PATH = [
  { x: 0.08, y: 0.14 },
  { x: 0.24, y: 0.32 },
  { x: 0.36, y: 0.42 },
  { x: 0.44, y: 0.47 },
  { x: 0.48, y: 0.49 },
  { x: 0.5, y: 0.5 },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "descent") ?? wordAt(words, "downhill") ?? 0.3;
  const progress = voiced ? interpolate(now, [start, start + 3.2], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="Gradient descent walks downhill" size={40} color={tokens.color.ink} />
      <LossLandscape path={PATH} color="blue" progress={progress} />
    </AbsoluteFill>
  );
}
