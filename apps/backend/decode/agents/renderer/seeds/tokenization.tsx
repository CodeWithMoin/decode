// SEED · tokenization — a word split into subword tokens, each in its own cell.
// Composes Cells (the tokens) + Label. Edit the `TOKENS` and cue words; keep the
// Cells composition and the narration-timed reveal.
import { AbsoluteFill, Cells, Label, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
const TOKENS = ["un", "break", "able"].map((label, i) => ({ label, color: (["blue", "orange", "green"] as const)[i] }));
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const wordIn = voiced ? interpolate(now, [0.15, 0.65], [0, 1], ease) : 1; // the word fades in first
  const at = wordAt(words, "tokens") ?? wordAt(words, "split") ?? 0.8;
  const progress = voiced ? interpolate(now, [at, at + 1.2], [0, 1], ease) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 960, top: 300, transform: "translateX(-50%)", opacity: wordIn }}>
        <Label text={"unbreakable"} size={56} color={tokens.color.ink} />
      </div>
      <Cells cells={TOKENS} orientation="row" cellSize={200} gap={16} at={{ x: 960, y: 560 }} progress={progress} />
    </AbsoluteFill>
  );
}
