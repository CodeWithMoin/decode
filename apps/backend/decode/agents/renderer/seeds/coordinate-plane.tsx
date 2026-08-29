// SEED · coordinate-plane — a 2-D plane (origin at centre, four quadrants) with
// points plotted on it. A light grid gives scale; the points pop in on the
// narration. Edit the domains, the `points`, and the `cue` words; keep the
// Axes2D composition and the narration-timed build.
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

const BUILD = 1.2;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "plot") ?? wordAt(words, "point") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + BUILD], [0, 1], ease) : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Axes2D
        xDomain={[-5, 5]}
        yDomain={[-5, 5]}
        points={[
          { x: 3, y: 2, label: "(3, 2)", color: "orange" },
          { x: -2, y: -3, label: "(-2, -3)", color: "blue" },
        ]}
        progress={progress}
      />
    </AbsoluteFill>
  );
}
