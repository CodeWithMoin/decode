// SEED · quote — a pulled quote with attribution, the line revealing word by word
// and the author name fading in after it lands. Composes Statement + Label. Edit
// `QUOTE`/`AUTHOR` and the words.
import { AbsoluteFill, Statement, Label, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const QUOTE = "Premature optimization is the root of all evil.";
const AUTHOR = "Donald Knuth";
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  // The author fades in once the quote has mostly finished revealing.
  const authorAt = voiced ? (words![Math.min(words!.length - 1, Math.floor(words!.length * 0.8))].startInSeconds) : 0;
  const authorIn = voiced ? interpolate(now, [authorAt, authorAt + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_PRESETS.easeInOut }) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 300, top: 340, fontFamily: tokens.font.family, fontSize: 200, fontWeight: 800, color: tokens.concept.blue.fill, lineHeight: 0.7 }}>&ldquo;</div>
      <Statement text={QUOTE} words={words} reveal="word" size={78} accent="blue" at={{ x: 960, y: 480 }} maxWidth={1300} />
      <div style={{ position: "absolute", left: 960, top: 660, transform: `translate(-50%, ${(1 - authorIn) * 12}px)`, opacity: authorIn }}>
        <Label text={`— ${AUTHOR}`} size={36} color={tokens.color.support} />
      </div>
    </AbsoluteFill>
  );
}
