import { AbsoluteFill, tokens, useCurrentFrame, useVideoConfig } from "@decode/animation-api";
import Scene from "@decode/seeds/coordinate-plane";

type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const SCRIPT =
  "On a coordinate plane, every point has an x and a y. We can plot one point up here, and another one down there.";
const STEP = 0.3;
const WORDS: Word[] = SCRIPT.split(/\s+/).map((word, i) => ({
  word,
  startInSeconds: Number((i * STEP).toFixed(3)),
  endInSeconds: Number(((i + 1) * STEP).toFixed(3)),
}));
export const COORDPLANE_PREVIEW_DURATION = Math.round((WORDS.length * STEP + 1.2) * 30);
const CUES = new Set(["plot", "point"]);

export function CoordPlanePreview() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  return (
    <AbsoluteFill>
      <Scene words={WORDS} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 60, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 10px", padding: "0 160px", fontFamily: tokens.font.family, fontSize: 30 }}>
        {WORDS.map((w, i) => {
          const spoken = now >= w.startInSeconds;
          const current = now >= w.startInSeconds && now < w.endInSeconds;
          const cue = CUES.has(norm(w.word));
          return (
            <span key={i} style={{ color: current ? tokens.color.ink : spoken ? tokens.color.support : "#d7d4cc", fontWeight: cue ? 700 : 500, borderBottom: cue ? `2px solid ${tokens.color.support}` : undefined }}>
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
