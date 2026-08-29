// SEED · vector — arrows drawn from the origin in the plane, growing to their
// coordinates on the narration (here: two vectors being added). Edit the
// `vectors`, the domains, and the `cue` words; keep the Axes2D vectors
// composition and the narration-timed grow-out.
import {
  AbsoluteFill,
  Axes2D,
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

const GROW = 1.4;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "vector") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + GROW], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Axes2D
        xDomain={[-5, 5]}
        yDomain={[-5, 5]}
        vectors={[
          { x: 3, y: 1, label: "a", color: "blue" },
          { x: 1, y: 3, label: "b", color: "orange" },
        ]}
        progress={progress}
      />
    </AbsoluteFill>
  );
}
