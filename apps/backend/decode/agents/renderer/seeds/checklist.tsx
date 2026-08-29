// SEED · checklist — items that check off one by one (each row appears, then its box fills with a ✓). For steps done, requirements met, or a recap. Edit the ITEMS and cue words.
// Composes CheckList. Keep the top-to-bottom check-off; change the items (and their
// per-item colour if you want each a different concept).
import {
  AbsoluteFill,
  CheckList,
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

const ITEMS = [
  { text: "Split the data" },
  { text: "Train the model" },
  { text: "Measure on a held-out set" },
  { text: "Tune and repeat" },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const titleIn = voiced ? interpolate(now, [0.2, 0.7], [0, 1], ease) : 1;
  const start = wordAt(words, "steps") ?? wordAt(words, "recipe") ?? 0.8;
  const progress = voiced ? interpolate(now, [start, start + 3.4], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 200, top: 150, opacity: titleIn }}>
        <Label text="The training recipe" size={48} color={tokens.color.ink} weight={800} />
      </div>
      <CheckList items={ITEMS} color="green" progress={progress} at={{ x: 960, y: 580 }} />
    </AbsoluteFill>
  );
}
