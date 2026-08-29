// SEED · array — values stored in a row at numbered indices, one cell
// highlighted as the one being accessed. Cells stagger in on the narration.
// Edit the `VALUES`, the `highlight` index, and the `cue` words; keep the Cells
// orientation="row" indices composition and the narration-timed build.
import {
  AbsoluteFill,
  Cells,
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

const VALUES = ["12", "5", "9", "21", "8", "3"];
const CELLS = VALUES.map((label) => ({ label }));
const BUILD = 1.4;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const startAt = wordAt(words, "array") ?? 0.3;
  const progress = voiced ? interpolate(now, [startAt, startAt + BUILD], [0, 1], ease) : 1;
  // The accessed cell rings once the row is built and the narration reaches it.
  const showHi = (wordAt(words, "index") ?? startAt + BUILD) <= now || !voiced;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Cells cells={CELLS} orientation="row" indices highlight={showHi ? 3 : undefined} progress={progress} />
    </AbsoluteFill>
  );
}
