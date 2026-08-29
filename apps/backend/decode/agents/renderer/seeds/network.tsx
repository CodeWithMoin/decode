// SEED · network — a neural network diagram that builds left to right: input
// neurons, weighted edges, a hidden layer, then the output. Composes the
// Network component, which guarantees the build order (nothing floats or
// appears before what it connects to). Edit `LAYERS`, the labels and colours to
// show a different network; keep the narration-timed left-to-right build.
import {
  AbsoluteFill,
  Network,
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

const LAYERS = [3, 4, 2]; // input, hidden, output neuron counts

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  // Build left to right across the narration: start as inputs are named, finish
  // as the output is named.
  const startAt = wordAt(words, "inputs") ?? wordAt(words, "input") ?? 0.5;
  const endAt = wordAt(words, "output") ?? startAt + 3.0;
  const progress = voiced
    ? interpolate(now, [startAt, Math.max(startAt + 1.5, endAt)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Network
        layers={LAYERS}
        layerLabels={["Input", "Hidden", "Output"]}
        layerColors={["blue", "orange", "green"]}
        progress={progress}
      />
    </AbsoluteFill>
  );
}
