// SEED · annotated-plot — a curve with a Callout pointing at a key spot (here the minimum). Compose Callout OVER any figure to point and name; edit the anchor `at`, the label, and the side.
// Composes Plot + Callout. Keep the curve-then-annotation reveal; change the data,
// the anchor point (in frame coords), and the callout label/side.
import {
  AbsoluteFill,
  Plot,
  Callout,
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

const RECT = { x: 360, y: 200, width: 1200, height: 660 };
const YMAX = 1.5;
// A convex loss curve bottoming out near x=0.82.
const DATA = Array.from({ length: 60 }, (_, i) => {
  const x = i / 59;
  const y = 0.18 + 1.15 * (x - 0.82) * (x - 0.82) + 0.03 * (1 - x);
  return { x, y };
});
const MIN = { x: 0.82, y: 0.18 };
const ANCHOR = {
  x: RECT.x + MIN.x * RECT.width,
  y: RECT.y + RECT.height - (MIN.y / YMAX) * RECT.height,
};

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const draw = wordAt(words, "loss") ?? 0.3;
  const progress = voiced ? interpolate(now, [draw, draw + 2.2], [0, 1], ease) : 1;
  const at = wordAt(words, "minimum") ?? draw + 2.4;
  const callP = voiced ? interpolate(now, [at, at + 1.1], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="Gradient descent finds the minimum" size={40} color={tokens.color.ink} />
      <Plot data={DATA} xDomain={[0, 1]} yDomain={[0, YMAX]} color="blue" progress={progress} rect={RECT} xLabel="parameter" yLabel="loss" />
      <Callout at={ANCHOR} label="minimum" side="up" color="orange" progress={callP} />
    </AbsoluteFill>
  );
}
