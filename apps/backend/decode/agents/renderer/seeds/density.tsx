// SEED · density — a probability density curve with a shaded region under it (a probability mass / confidence interval) and a sample rug. Edit the curve, the shaded range, and the samples.
// Composes Density. Keep the left→right draw and the shaded mass fading in; change the
// distribution, the shade range [a,b], and the sample ticks.
import {
  AbsoluteFill,
  Density,
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

const MEAN = 0;
const SIGMA = 1;
const gauss = (x: number) => Math.exp(-((x - MEAN) ** 2) / (2 * SIGMA * SIGMA));
const CURVE = Array.from({ length: 80 }, (_, i) => {
  const x = -4 + (i / 79) * 8;
  return { x, y: gauss(x) };
});
const SAMPLES = [-1.6, -0.9, -0.3, 0.1, 0.4, 0.8, 1.3, 2.1];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const draw = wordAt(words, "distribution") ?? wordAt(words, "density") ?? 0.3;
  const progress = voiced ? interpolate(now, [draw, draw + 2.6], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="One standard deviation holds ~68%" size={40} color={tokens.color.ink} />
      <Density curve={CURVE} xDomain={[-4, 4]} shade={[-1, 1]} samples={SAMPLES} color="blue" progress={progress} />
    </AbsoluteFill>
  );
}
