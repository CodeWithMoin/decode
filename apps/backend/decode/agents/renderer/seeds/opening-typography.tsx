// SEED · opening-typography — the scene OPENS with the first narration line as centre-stage typography (revealed word-by-word as spoken), then it clears and the content comes in. Edit OPENING, the content, and the cue.
// Composes Statement (the spoken opening) + Label + Cells (the content). Keep the two
// phases: opening line reveals word-by-word, then fades as the content builds on its
// cue word. Change the opening phrase, the content, and the cue.
import {
  AbsoluteFill,
  Statement,
  Label,
  Cells,
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

const OPENING = "Before anything else";
const TOKENS = ["un", "break", "able"].map((label, i) => ({ label, color: (["blue", "orange", "green"] as const)[i] }));

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  // Content arrives on its cue word; the opening line clears just before it.
  const at = wordAt(words, "tokens") ?? wordAt(words, "split") ?? 2.0;
  const openOut = voiced ? interpolate(now, [at - 0.3, at + 0.3], [1, 0], ease) : 0; // opening fades out
  const titleIn = voiced ? interpolate(now, [at, at + 0.5], [0, 1], ease) : 1;
  const cellsP = voiced ? interpolate(now, [at, at + 1.2], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {/* PHASE 1 — the spoken opening line, centre stage, word-by-word */}
      <div style={{ opacity: openOut }}>
        <Statement text={OPENING} words={words} reveal="word" accent="blue" />
      </div>
      {/* PHASE 2 — the content, arriving as the opening clears */}
      <div style={{ opacity: titleIn }}>
        <Label text="Words become tokens" size={40} color={tokens.color.ink} region="top" />
      </div>
      <Cells cells={TOKENS} orientation="row" cellSize={200} gap={16} at={{ x: 960, y: 560 }} progress={cellsP} />
    </AbsoluteFill>
  );
}
