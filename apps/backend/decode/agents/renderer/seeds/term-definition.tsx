// SEED · term-definition — one big term in its accent colour with a plain
// definition beneath; the term lands first, the definition a beat later, both on
// the narration. Edit `TERM`, `DEFINITION`, the `accent`, and pass the beat's
// words; keep the Term composition and the narration-timed reveal.
import { AbsoluteFill, Term, tokens, useVideoConfig } from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };

const TERM = "Overfitting";
const DEFINITION = "when a model memorises its training data instead of learning the pattern, so it fails on anything new.";

export default function Scene({ words }: { words?: Word[] }) {
  useVideoConfig();
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Term term={TERM} definition={DEFINITION} words={words} emphasize={["memorises", "fails"]} accent="orange" />
    </AbsoluteFill>
  );
}
