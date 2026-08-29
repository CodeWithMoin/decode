// SEED · tree — a top-down concept hierarchy (here: how machine learning splits
// into families), boxes joined parent→child, building level by level on the
// narration. Edit the nested `TREE` ({label, color?, children?}), the colours
// and the `cue` words to teach a different taxonomy or decision tree; keep the
// Tree composition and the narration-timed top-down build.
import {
  AbsoluteFill,
  Tree,
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

const TREE = {
  label: "Machine Learning",
  color: "blue" as const,
  children: [
    {
      label: "Supervised",
      color: "orange" as const,
      children: [
        { label: "Classification", color: "green" as const },
        { label: "Regression", color: "green" as const },
      ],
    },
    {
      label: "Unsupervised",
      color: "purple" as const,
      children: [{ label: "Clustering", color: "green" as const }],
    },
  ],
};
const BUILD = 2.2; // seconds the whole tree takes to build, top to bottom

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const startAt = wordAt(words, "learning") ?? wordAt(words, "splits") ?? 0.3;
  const progress = voiced
    ? interpolate(now, [startAt, startAt + BUILD], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Tree data={TREE} shape="box" progress={progress} />
    </AbsoluteFill>
  );
}
