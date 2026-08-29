// SEED · state-machine — states joined by labelled transitions, including a
// self-loop (stay in a state) and a curved return edge. The model places states
// with x/y; edges carry a `label` and a `variant`. Edit `NODES`/`EDGES` and the
// `cue` words to model a different machine; keep the Graph composition and the
// narration-timed build.
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
  { id: "idle", label: "Idle", x: 560, y: 460, color: "blue" as const },
  { id: "run", label: "Run", x: 960, y: 460, color: "orange" as const },
  { id: "done", label: "Done", x: 1360, y: 460, color: "green" as const },
];
const EDGES = [
  { from: "idle", to: "run", label: "start", variant: "straight" as const },
  { from: "run", to: "run", label: "tick", variant: "self-loop" as const },
  { from: "run", to: "done", label: "finish", variant: "straight" as const },
  // Route the return edge BELOW the row (negative curve) so it clears the self-loop above.
  { from: "done", to: "idle", label: "reset", variant: "curved" as const, curve: -0.3, color: "purple" as const },
];
const BUILD = 2.6;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const startAt = wordAt(words, "state") ?? wordAt(words, "machine") ?? 0.3;
  const progress = voiced
    ? interpolate(now, [startAt, startAt + BUILD], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Graph nodes={NODES} edges={EDGES} layout="positions" progress={progress} />
    </AbsoluteFill>
  );
}
