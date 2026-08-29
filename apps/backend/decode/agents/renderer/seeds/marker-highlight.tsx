// SEED · marker-highlight — a highlighter sweep behind a key phrase to emphasise it (the 3Blue1Brown move), under a small context line. Edit the CONTEXT line, the PHRASE, and the colour.
// Composes MarkerHighlight + Label. Keep the context-then-sweep reveal; the highlighter
// draws in on its cue word. Change the phrase, the context, and the colour.
import {
  AbsoluteFill,
  MarkerHighlight,
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

const CONTEXT = "What we really want is";
const PHRASE = "generalization";

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const ctxIn = voiced ? interpolate(now, [0.2, 0.8], [0, 1], ease) : 1;
  const at = wordAt(words, "generalization") ?? wordAt(words, "want") ?? 1.0;
  const sweep = voiced ? interpolate(now, [at, at + 0.7], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 960, top: 440, transform: "translateX(-50%)", opacity: ctxIn }}>
        <Label text={CONTEXT} size={44} color={tokens.color.support} />
      </div>
      <MarkerHighlight text={PHRASE} color="orange" size={92} at={{ x: 960, y: 560 }} progress={sweep} />
    </AbsoluteFill>
  );
}
