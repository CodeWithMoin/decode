// SEED · architecture — a model's block diagram: labeled blocks stacked in data-flow order (input at the bottom) with residual/skip arcs, built bottom-up on the narration. Edit BLOCKS + SKIPS.
// Composes BlockDiagram. Keep the flow-order build and the narration-timed reveal;
// change the block labels/colours, the sub-blocks, and the skip connections.
import {
  AbsoluteFill,
  BlockDiagram,
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

const BLOCKS = [
  { label: "Input Embedding", color: "blue" as const },
  { label: "+ Positional Encoding", color: "blue" as const },
  { label: "Multi-Head Attention", color: "orange" as const, sub: ["Q", "K", "V"] },
  { label: "Add & Norm", color: "green" as const },
  { label: "Feed Forward", color: "purple" as const },
  { label: "Add & Norm", color: "green" as const },
  { label: "Linear + Softmax", color: "blue" as const },
];
const SKIPS = [
  { from: 1, to: 3, label: "residual" },
  { from: 3, to: 5, label: "residual" },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "embedding") ?? wordAt(words, "input") ?? 0.4;
  const progress = voiced ? interpolate(now, [start, start + 4.5], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="The Transformer block" size={40} color={tokens.color.ink} />
      <BlockDiagram blocks={BLOCKS} flow="up" skips={SKIPS} progress={progress} />
    </AbsoluteFill>
  );
}
