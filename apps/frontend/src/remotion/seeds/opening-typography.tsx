import { AbsoluteFill, tokens, useCurrentFrame, useVideoConfig } from "@decode/animation-api";
import Scene from "@decode/seeds/opening-typography";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SCRIPT = "Before anything else, the text is split into tokens the model can look up.";
const STEP = 0.32;
const WORDS: Word[] = SCRIPT.split(/\s+/).map((word, i) => ({ word, startInSeconds: Number((i*STEP).toFixed(3)), endInSeconds: Number(((i+1)*STEP).toFixed(3)) }));
export const OPENING_TYPOGRAPHY_PREVIEW_DURATION = Math.round((WORDS.length*STEP + 1.8)*30);
const CUES = new Set<string>(["tokens"]);
export function OpeningTypographyPreview() {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig(); const now = frame/fps;
  return (<AbsoluteFill><Scene words={WORDS} />
    <div style={{ position:"absolute", left:0, right:0, bottom:60, display:"flex", flexWrap:"wrap", justifyContent:"center", gap:"6px 10px", padding:"0 160px", fontFamily:tokens.font.family, fontSize:30 }}>
      {WORDS.map((w,i)=>{ const spoken=now>=w.startInSeconds; const current=now>=w.startInSeconds&&now<w.endInSeconds; const cue=CUES.has(norm(w.word));
        return (<span key={i} style={{ color: current?tokens.color.ink:spoken?tokens.color.support:"#d7d4cc", fontWeight: cue?700:500, borderBottom: cue?`2px solid ${tokens.color.support}`:undefined }}>{w.word}</span>); })}
    </div></AbsoluteFill>);
}
