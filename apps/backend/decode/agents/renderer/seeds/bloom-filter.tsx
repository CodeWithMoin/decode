// SEED · bloom-filter — an item hashed to several positions in a bit array, those
// bits flipping to 1. Composes Cells (the bit array, with MULTI-highlight for the
// set bits) + Node (the item) + Arrow (the hash functions). Edit the item, the
// `HASHES` positions and the `cue` words; keep the compose-and-highlight shape and
// the narration-timed build. (Proof that patterns compose: three components, one
// scene, one frame clock.)
import {
  AbsoluteFill,
  Cells,
  Node,
  Arrow,
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

const BITS = 12;
const HASHES = [2, 6, 9]; // the positions "cat" hashes to
const CELL = 96;
const GAP = 6;
const AT = { x: 960, y: 680 };
// Geometry of the bit array, so the hash arrows can aim at exact cells.
const totalW = BITS * CELL + (BITS - 1) * GAP;
const left = AT.x - totalW / 2;
const cellTopX = (i: number) => left + i * (CELL + GAP) + CELL / 2;
const cellTopY = AT.y - CELL / 2;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const hashAt = wordAt(words, "hash") ?? 1.2;
  const setAt = wordAt(words, "bits") ?? hashAt + 1.0;
  const arrows = voiced ? interpolate(now, [hashAt, hashAt + 0.8], [0, 1], ease) : 1;
  const set = !voiced || now >= setAt;

  // Set bits show "1"; the rest stay "0". The set bits multi-highlight.
  const cells = Array.from({ length: BITS }, (_, i) => ({ label: set && HASHES.includes(i) ? "1" : "0" }));
  const highlight = set ? HASHES : [];

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {/* The item being inserted. */}
      <div style={{ position: "absolute", left: AT.x, top: 250, transform: "translate(-50%, -50%)" }}>
        <Node color="orange" filled>cat</Node>
      </div>
      {/* One hash arrow per position. */}
      {HASHES.map((i, k) => (
        <Arrow
          key={k}
          from={{ x: AT.x, y: 300 }}
          to={{ x: cellTopX(i), y: cellTopY }}
          variant="straight"
          color="blue"
          progress={arrows}
        />
      ))}
      {/* The bit array; set bits light up. */}
      <Cells cells={cells} orientation="row" indices highlight={highlight} highlightColor="blue" cellSize={CELL} gap={GAP} at={AT} progress={1} />
    </AbsoluteFill>
  );
}
