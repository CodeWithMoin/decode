// SEED · kicker-headline — a small uppercase eyebrow over a big headline. Composes
// Label (kicker) + Statement (headline). The eyebrow fades in, then the headline
// reveals word by word. Edit `KICKER`/`HEADLINE` and the words.
import { AbsoluteFill, Statement, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const KICKER = "WHY IT MATTERS";
const HEADLINE = "Attention changed everything.";
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const kickerIn = voiced ? interpolate(now, [0.1, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_PRESETS.easeInOut }) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 960, top: 400, transform: `translate(-50%, ${(1 - kickerIn) * -12}px)`, fontFamily: tokens.font.family, fontSize: 30, fontWeight: 700, letterSpacing: 4, color: tokens.concept.orange.stroke, opacity: kickerIn }}>{KICKER}</div>
      <Statement text={HEADLINE} words={words} reveal="word" size={104} accent="blue" at={{ x: 960, y: 560 }} maxWidth={1400} />
    </AbsoluteFill>
  );
}
