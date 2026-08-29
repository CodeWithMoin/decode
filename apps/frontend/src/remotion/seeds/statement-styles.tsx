// Preview only: one composition per Statement reveal style so each can be
// scrubbed in Studio. Renders the Statement component directly (not a seed).
import { AbsoluteFill, Statement, tokens, useCurrentFrame, useVideoConfig } from "@decode/animation-api";
import type { CSSProperties } from "react";

type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const SCRIPT = "Attention lets a model weigh what matters.";
const STEP = 0.34;
const WORDS: Word[] = SCRIPT.split(/\s+/).map((word, i) => ({
  word,
  startInSeconds: Number((i * STEP).toFixed(3)),
  endInSeconds: Number(((i + 1) * STEP).toFixed(3)),
}));
export const STATEMENT_STYLE_DURATION = Math.round((WORDS.length * STEP + 1.6) * 30);

const REVEALS = ["word", "fade", "rise", "scale", "typewriter"] as const;

function Caption() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const style: CSSProperties = {
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
  };
  return (
    <div style={style}>
      {WORDS.map((w, i) => {
        const spoken = now >= w.startInSeconds;
        const current = now >= w.startInSeconds && now < w.endInSeconds;
        return (
          <span key={i} style={{ color: current ? tokens.color.ink : spoken ? tokens.color.support : "#d7d4cc" }}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

function make(reveal: (typeof REVEALS)[number]) {
  return function StatementStyle() {
    return (
      <AbsoluteFill style={{ background: tokens.color.surface }}>
        <Statement
          text={SCRIPT}
          words={WORDS}
          emphasize={["weigh", "what", "matters"]}
          reveal={reveal}
          accent="blue"
        />
        <Caption />
      </AbsoluteFill>
    );
  };
}

export const StmtWord = make("word");
export const StmtFade = make("fade");
export const StmtRise = make("rise");
export const StmtScale = make("scale");
export const StmtTypewriter = make("typewriter");
