// SEED · stat — a single big figure that counts up, for a beat that is really
// one number ("175B parameters", "92% accuracy"). Composes the Stat component.
// Edit the value, suffix, label, accent and the `cue` word to show a different
// figure; keep the count-up timed to the narration.
import {
  AbsoluteFill,
  Stat,
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
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

const COUNT = 2.0; // seconds the number takes to count up (long enough to watch)

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const startAt = wordAt(words, "hundred") ?? 0.6;
  const progress = voiced
    ? interpolate(now, [startAt, startAt + COUNT], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Stat value={175} suffix="B" label="parameters" accent="blue" progress={progress} />
    </AbsoluteFill>
  );
}
