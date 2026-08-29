// SEED · scribble-circle — a hand-drawn circle drawn around a key word for emphasis (the "circle the important thing" move), after a small context line. Edit the CONTEXT, the WORD, and the colour.
// Composes ScribbleCircle + Label. The word appears with the context, then the circle
// draws on around it on its cue word. Change the word, context, and colour; or drop
// `text` and give `at`+width/height to ring an element in another figure.
import {
  AbsoluteFill,
  ScribbleCircle,
  Label,
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

const CONTEXT = "The failure mode to watch is";
const WORD = "overfitting";

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const ctxIn = voiced ? interpolate(now, [0.2, 0.8], [0, 1], ease) : 1;
  const wordIn = voiced ? interpolate(now, [0.4, 1.0], [0, 1], ease) : 1;
  const at = wordAt(words, "overfitting") ?? wordAt(words, "watch") ?? 1.4;
  const circleP = voiced ? interpolate(now, [at, at + 0.9], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 960, top: 440, transform: "translateX(-50%)", opacity: ctxIn }}>
        <Label text={CONTEXT} size={44} color={tokens.color.support} />
      </div>
      <div style={{ opacity: wordIn }}>
        <ScribbleCircle text={WORD} color="orange" size={92} at={{ x: 960, y: 570 }} progress={circleP} />
      </div>
    </AbsoluteFill>
  );
}
