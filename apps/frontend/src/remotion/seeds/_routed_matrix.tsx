import {
  AbsoluteFill,
  Matrix,
  tokens,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  EASE_PRESETS,
} from "@decode/animation-api";

type Word = {
  word: string;
  startInSeconds: number;
  endInSeconds: number;
};

type SceneProps = {
  words?: Word[];
  revealDuration?: number;
  highlightCue?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

const TOKENS = ["The", "cat", "sat", "down"];

// Rows are query tokens and columns are the tokens they attend to.
// The strongest relationship is sat -> cat.
const VALUES = [
  [0.6, 0.2, 0.1, 0.1],
  [0.1, 0.7, 0.1, 0.1],
  [0.1, 0.85, 0.1, 0.05],
  [0.2, 0.2, 0.2, 0.4],
];

const HIGHLIGHT = { row: 2, col: 1 };

export default function Scene({
  words,
  revealDuration = 1.2,
  highlightCue = "stronger",
}: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const duration = Math.max(0.1, revealDuration);

  const fillAt = wordAt(words, "scores") ?? 0.5;
  const highlightAt = wordAt(words, highlightCue) ?? 3.2;

  const progress = voiced
    ? interpolate(now, [fillAt, fillAt + duration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  const highlight = !voiced || now >= highlightAt ? HIGHLIGHT : undefined;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Matrix
        values={VALUES}
        color="blue"
        rowLabels={TOKENS}
        colLabels={TOKENS}
        highlight={highlight}
        progress={progress}
        at={{ x: 960, y: 560 }}
      />
    </AbsoluteFill>
  );
}
