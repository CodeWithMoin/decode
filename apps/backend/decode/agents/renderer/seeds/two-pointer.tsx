// SEED · two-pointer — TRACE with two cursors: lo and hi start at the ends of a
// sorted array and move inward until they find a pair summing to the target.
// Composes Cells (`dim` for the excluded ends) + two Pointers (lo below, hi
// above, so they never collide) + a running sum note. Edit `VALUES`/`TARGET`,
// re-run to regenerate `STEPS`, and the `cue` words.
import {
  AbsoluteFill,
  Cells,
  Pointer,
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

const VALUES = [1, 3, 5, 8, 11, 15];
const TARGET = 13;
const STEPS = [
  { lo: 0, hi: 5, found: false, note: "1 + 15 = 16  >  13  →  move hi left" },
  { lo: 0, hi: 4, found: false, note: "1 + 11 = 12  <  13  →  move lo right" },
  { lo: 1, hi: 4, found: false, note: "3 + 11 = 14  >  13  →  move hi left" },
  { lo: 1, hi: 3, found: false, note: "3 + 8 = 11  <  13  →  move lo right" },
  { lo: 2, hi: 3, found: true, note: "5 + 8 = 13  →  found!" },
];

const CELL = 128;
const GAP = 10;
const N = VALUES.length;
const AT = { x: 960, y: 480 };
const totalW = N * CELL + (N - 1) * GAP;
const left = AT.x - totalW / 2;
const cellX = (i: number) => left + i * (CELL + GAP) + CELL / 2;
const TOP = AT.y - CELL / 2;
const BOT = AT.y + CELL / 2;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const t0 = wordAt(words, "pointers") ?? wordAt(words, "ends") ?? 0.8;
  const STEP = 1.2;
  const started = !voiced || now >= t0;
  let kf = 0;
  for (let k = 0; k < STEPS.length; k++) if (!voiced || now >= t0 + k * STEP) kf = k;
  const step = STEPS[kf];

  // Carets hold on a step, glide at the boundary.
  const slide = (vals: number[]) => {
    if (!voiced) return vals[vals.length - 1];
    const bp: number[] = [];
    const out: number[] = [];
    vals.forEach((v, k) => {
      if (k > 0) {
        bp.push(t0 + k * STEP - 0.35);
        out.push(vals[k - 1]);
      }
      bp.push(t0 + k * STEP);
      out.push(v);
    });
    return interpolate(now, bp, out, ease);
  };
  const loX = slide(STEPS.map((s) => cellX(s.lo)));
  const hiX = slide(STEPS.map((s) => cellX(s.hi)));

  const cells = VALUES.map((v) => ({ label: String(v) }));
  const dim = started ? VALUES.map((_, i) => i).filter((i) => i < step.lo || i > step.hi) : [];
  const found = started && step.found;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: AT.x, top: 190, transform: "translateX(-50%)" }}>
        <Label text={`find two that sum to ${TARGET}`} size={40} color={tokens.color.ink} />
      </div>
      {started && <Pointer at={{ x: hiX, y: TOP }} label="hi" direction="down" color="blue" size={30} />}
      <Cells cells={cells} orientation="row" cellSize={CELL} gap={GAP} at={AT} dim={dim} highlight={found ? [step.lo, step.hi] : []} highlightColor="green" progress={1} />
      {started && <Pointer at={{ x: loX, y: BOT }} label="lo" direction="up" color="green" size={30} />}
      {started && (
        <div style={{ position: "absolute", left: AT.x, top: 720, transform: "translateX(-50%)", fontFamily: tokens.font.family, fontSize: 34, fontWeight: 700, color: found ? tokens.concept.green.stroke : tokens.color.ink, whiteSpace: "nowrap" }}>
          {step.note}
        </div>
      )}
    </AbsoluteFill>
  );
}
