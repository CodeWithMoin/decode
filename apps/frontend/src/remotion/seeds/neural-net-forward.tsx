import { AbsoluteFill, tokens, useCurrentFrame, useVideoConfig } from "@decode/animation-api";
// The scene itself is the canonical, backend-owned seed (agents/renderer/seeds),
// the same file injected into the Motion Designer's prompt. This module only
// adds a Studio preview around it — synthetic narration + a caption strip so the
// word->element timing is visible while scrubbing. One seed, no duplication.
import Scene from "@decode/seeds/process-flow";

type Word = { word: string; startInSeconds: number; endInSeconds: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const PREVIEW_SCRIPT =
  "We start with a dosage. We multiply it by a weight, and the signal flows into a hidden activation. One more weight, and out comes the efficacy.";
const PREVIEW_STEP = 0.3; // seconds per word

const PREVIEW_WORDS: Word[] = PREVIEW_SCRIPT.split(/\s+/).map((word, i) => ({
  word,
  startInSeconds: Number((i * PREVIEW_STEP).toFixed(3)),
  endInSeconds: Number(((i + 1) * PREVIEW_STEP).toFixed(3)),
}));

export const SEED_PREVIEW_DURATION = Math.round(
  (PREVIEW_WORDS.length * PREVIEW_STEP + 1.6) * 30,
);

// Cue words that trigger an element in the seed — highlighted so each one is
// visibly firing its box or arrow as the playhead crosses it.
const CUES = new Set(["dosage", "multiply", "activation", "flows", "efficacy"]);

export function NeuralNetForwardPreview() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  return (
    <AbsoluteFill>
      <Scene words={PREVIEW_WORDS} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 60,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 10px",
          padding: "0 160px",
          fontFamily: tokens.font.family,
          fontSize: 30,
        }}
      >
        {PREVIEW_WORDS.map((w, i) => {
          const spoken = now >= w.startInSeconds;
          const current = now >= w.startInSeconds && now < w.endInSeconds;
          const cue = CUES.has(norm(w.word));
          return (
            <span
              key={i}
              style={{
                color: current ? tokens.color.ink : spoken ? tokens.color.support : "#d7d4cc",
                fontWeight: cue ? 700 : 500,
                borderBottom: cue ? `2px solid ${tokens.color.support}` : undefined,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
