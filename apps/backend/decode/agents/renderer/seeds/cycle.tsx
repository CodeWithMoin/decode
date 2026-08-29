// SEED · cycle — a process that REPEATS: stages on a ring where the last returns to the first (training loop, feedback loop, refresh cycle). Use when steps come around again — NOT a one-way sequence, that is `timeline`.
// `layout="ring"` drops the nodes evenly on a circle; edges join each to
// the next and the last back to the first, so the cycle reads as a cycle. Edit
// the `NODES` and the `cue` words; keep the Graph layout="ring" composition and
// the narration-timed build.
import {
  AbsoluteFill,
  Graph,
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

const NODES = [
  { id: "fwd", label: "Forward", color: "blue" as const },
  { id: "loss", label: "Loss", color: "orange" as const },
  { id: "bwd", label: "Backward", color: "purple" as const },
  { id: "upd", label: "Update", color: "green" as const },
];
// Each stage flows to the next; the last closes the loop back to the first.
const EDGES = NODES.map((n, i) => ({
  from: n.id,
  to: NODES[(i + 1) % NODES.length].id,
  variant: "curved" as const,
}));
const BUILD = 2.6;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const startAt = wordAt(words, "loop") ?? wordAt(words, "cycle") ?? 0.3;
  const progress = voiced
    ? interpolate(now, [startAt, startAt + BUILD], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Graph nodes={NODES} edges={EDGES} layout="ring" radius={70} progress={progress} />
    </AbsoluteFill>
  );
}
