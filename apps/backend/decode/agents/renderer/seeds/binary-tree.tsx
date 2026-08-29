// SEED · binary-tree — a binary search tree of numbers (smaller left, larger
// right), circle nodes building top-down on the narration. Edit the nested
// `BST` ({label, children?}), the values and the `cue` words to show a heap, a
// different BST or a game tree; keep the Tree shape="circle" composition and the
// narration-timed top-down build.
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

const BST = {
  label: "8",
  children: [
    { label: "3", children: [{ label: "1" }, { label: "6" }] },
    { label: "10", children: [{ label: "14" }] },
  ],
};
const BUILD = 2.0;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const startAt = wordAt(words, "tree") ?? wordAt(words, "root") ?? 0.3;
  const progress = voiced
    ? interpolate(now, [startAt, startAt + BUILD], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Tree data={BST} shape="circle" progress={progress} rect={{ x: 460, y: 200, width: 1000, height: 640 }} />
    </AbsoluteFill>
  );
}
