import {
  AbsoluteFill,
  Plot,
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
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

// A simple bowl-shaped loss curve whose lowest point is the best weight.
const MIN_X = 0.7;
const loss = (x: number) => 0.15 + 3 * (x - MIN_X) * (x - MIN_X);
const DATA = Array.from({ length: 60 }, (_, i) => {
  const x = i / 59;
  return { x, y: loss(x) };
});

const START_X = 0.08;
const CURVE_DRAW = 1.0;
const DESCEND = 1.4;
const PLOT_RECT = { x: 360, y: 200, width: 1200, height: 620 };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const ease = {
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
    easing: EASE_PRESETS.easeInOut,
  };

  const drawAt = wordAt(words, "loss") ?? 0.4;
  const visibleFrom = wordAt(words, "high") ?? 1.4;
  const descendFrom = wordAt(words, "downhill") ?? 1.8;

  const curveProgress = voiced
    ? interpolate(now, [drawAt, drawAt + CURVE_DRAW], [0, 1], ease)
    : 1;

  const markerAt = voiced
    ? interpolate(now, [descendFrom, descendFrom + DESCEND], [START_X, MIN_X], ease)
    : MIN_X;

  const markerEntry = voiced
    ? interpolate(now, [visibleFrom - 0.2, visibleFrom + 0.25], [0, 1], ease)
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Plot
        data={DATA}
        xDomain={[0, 1]}
        yDomain={[0, 1.8]}
        color="blue"
        progress={curveProgress}
        markerAt={markerAt}
        rect={PLOT_RECT}
      />

      <div
        style={{
          position: "absolute",
          left: PLOT_RECT.x + PLOT_RECT.width / 2,
          top: PLOT_RECT.y + PLOT_RECT.height + 28,
          transform: "translateX(-50%)",
          opacity: markerEntry,
        }}
      >
        <Label text="Weight" size={30} color={tokens.color.ink} />
      </div>

      <div
        style={{
          position: "absolute",
          left: PLOT_RECT.x - 52,
          top: PLOT_RECT.y + PLOT_RECT.height / 2,
          transform: "translate(-50%, -50%) rotate(-90deg)",
          opacity: markerEntry,
        }}
      >
        <Label text="Loss" size={30} color={tokens.color.ink} />
      </div>
    </AbsoluteFill>
  );
}