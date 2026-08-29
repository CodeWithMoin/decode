// SEED · scaling-law — loss vs compute on log-log axes, where a power law reads as a straight line (the scaling-law plot). Edit DATA and the domains; keep xLog + yLog.
// Composes Chart (kind="line", xLog + yLog). Keep the log axes and the draw-on reveal;
// change the data (a power law y = a·x^-b) and the axis labels.
import {
  AbsoluteFill,
  Chart,
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

// A power law: loss = 6 · compute^-0.08 (straight on log-log).
const DATA = Array.from({ length: 30 }, (_, i) => {
  const x = Math.pow(10, 2 + (i / 29) * 5); // 1e2 .. 1e7
  return { x, y: 6 * Math.pow(x, -0.08) };
});

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const draw = wordAt(words, "compute") ?? wordAt(words, "scaling") ?? 0.3;
  const progress = voiced ? interpolate(now, [draw, draw + 2.4], [0, 1], ease) : 1;
  const axes = voiced ? interpolate(now, [0.1, 0.9], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="Loss follows a scaling law" size={40} color={tokens.color.ink} />
      <Chart
        kind="line"
        data={DATA}
        xLog
        yLog
        xDomain={[100, 1e7]}
        yDomain={[1.5, 4.4]}
        color="blue"
        xLabel="compute"
        yLabel="loss"
        xAxisProgress={axes}
        yAxisProgress={axes}
        progress={progress}
      />
    </AbsoluteFill>
  );
}
