// SEED · equation — a formula that reveals term by term, variables carrying
// concept colours so they tie back to the diagram that named them (here: the
// perceptron, y = wx + b). Edit the `PARTS` (text + optional colour), the size,
// and pass the beat's words; keep the Equation composition and the reveal.
import { AbsoluteFill, Equation, tokens, useVideoConfig } from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };

// Each variable is its own part so it can reveal in order and carry a colour.
const PARTS = [
  { text: "y" },
  { text: "=" },
  { text: "w", color: "blue" as const },
  { text: "x", color: "orange" as const },
  { text: "+" },
  { text: "b", color: "green" as const },
];

export default function Scene({ words }: { words?: Word[] }) {
  useVideoConfig();
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Equation parts={PARTS} words={words} size={140} />
    </AbsoluteFill>
  );
}
