// SEED · timeline — events along a horizontal line, revealed left→right, labels
// alternating above and below (here: the model generations). Edit the `EVENTS`
// (label + optional sub), and the `cue` words; keep the Timeline composition and
// the narration-timed left-to-right build.
import {
  AbsoluteFill,
  Timeline,
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

const EVENTS = [
  { label: "GPT-2", sub: "2019", color: "blue" as const },
  { label: "GPT-3", sub: "2020", color: "orange" as const },
  { label: "GPT-4", sub: "2023", color: "green" as const },
  { label: "GPT-5", sub: "2025", color: "purple" as const },
];
const BUILD = 2.0;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "timeline") ?? wordAt(words, "began") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + BUILD], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Timeline events={EVENTS} progress={progress} />
    </AbsoluteFill>
  );
}
