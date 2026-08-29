// SEED · statement — a pure-text beat: one big line that reveals word-by-word
// on the narration, with the key words emphasised. Use when the idea IS the
// sentence and no diagram is needed. Composes the Statement component. Edit the
// `text` and `emphasize` words to state a different idea; keep the narration
// timing (Statement reveals each word as it is spoken from `words`).
import { AbsoluteFill, Statement, tokens } from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };

export default function Scene({ words }: { words?: Word[] }) {
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Statement
        text="Attention lets a model weigh what matters."
        words={words}
        emphasize={["weigh","what","matters"]}
        accent="blue"
      />
    </AbsoluteFill>
  );
}
