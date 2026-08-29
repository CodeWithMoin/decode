// SEED · self-attention — a row of tokens with weighted attention arcs: each token attends to the others, thicker/darker arc = stronger weight. Edit TOKENS + LINKS (from,to,weight).
// Composes SequenceLinks. Keep the token-then-arc reveal; change the tokens and the
// attention links (weights 0–1 set arc thickness/opacity).
import {
  AbsoluteFill,
  SequenceLinks,
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

const TOKENS = [
  { label: "The" },
  { label: "cat" },
  { label: "sat" },
  { label: "on" },
  { label: "it" },
];
// "it" attends back to "cat"; "sat" attends to its subject "cat".
const LINKS = [
  { from: 4, to: 1, weight: 0.95, color: "orange" as const },
  { from: 2, to: 1, weight: 0.6 },
  { from: 3, to: 2, weight: 0.4 },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "attends") ?? wordAt(words, "attention") ?? 0.3;
  const progress = voiced ? interpolate(now, [start, start + 3.2], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Label text="Self-attention" size={40} color={tokens.color.ink} />
      <SequenceLinks tokens={TOKENS} links={LINKS} color="blue" progress={progress} />
    </AbsoluteFill>
  );
}
