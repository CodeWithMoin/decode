// SEED · binary-search — TRACE with full mechanics: lo/hi bounds bracket the
// window (carets ABOVE, pointing down), mid is computed as (lo+hi)/2 (caret BELOW,
// pointing up), the formula and comparison update each step, and the eliminated
// half dims — until the target is found. Composes Cells (`dim` + `highlight`) +
// three Pointers + Label. Edit `VALUES`/`TARGET`, re-run the search to regenerate
// `STEPS`, and the `cue` words. The template for every algorithm walkthrough.
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

const VALUES = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
const TARGET = 23;
// The binary search, precomputed. `note` is the comparison; `cue` is the
// narration word that triggers this step — so each move lands on the voice.
const STEPS = [
  { lo: 0, hi: 9, mid: 4, found: false, note: "16 < 23  →  search right", cue: "middle" },
  { lo: 5, hi: 9, mid: 7, found: false, note: "56 > 23  →  search left", cue: "gone" },
  { lo: 5, hi: 6, mid: 5, found: true, note: "23 = 23  →  found!", cue: "leaves" },
];

const CELL = 108;
const GAP = 8;
const N = VALUES.length;
const AT = { x: 960, y: 470 };
const totalW = N * CELL + (N - 1) * GAP;
const left = AT.x - totalW / 2;
const cellX = (i: number) => left + i * (CELL + GAP) + CELL / 2;
const TOP = AT.y - CELL / 2; // where lo/hi carets point down onto
const BOT = AT.y + CELL / 2; // where mid caret points up onto

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const t0 = wordAt(words, "binary") ?? wordAt(words, "search") ?? 0.8;
  const STEP = 1.5; // fallback spacing when a step's cue word isn't found
  // Each step fires on its narration cue word (falling back to even spacing), and
  // times are forced strictly increasing so the caret glide never reverses.
  const stepTime: number[] = [];
  STEPS.forEach((s, k) => {
    const t = wordAt(words, s.cue) ?? t0 + k * STEP;
    stepTime.push(k === 0 ? t : Math.max(t, stepTime[k - 1] + 0.5));
  });
  const started = !voiced || now >= stepTime[0];
  let kf = 0;
  for (let k = 0; k < STEPS.length; k++) if (now >= stepTime[k]) kf = k;
  if (!voiced) kf = STEPS.length - 1;
  const step = STEPS[kf];

  // Carets HOLD on each step's positions until the next step's cue, then glide.
  const GLIDE = 0.4;
  const bp = [stepTime[0], stepTime[1] - GLIDE, stepTime[1], stepTime[2] - GLIDE, stepTime[2]];
  const slide = (vals: number[]) =>
    voiced ? interpolate(now, bp, [vals[0], vals[0], vals[1], vals[1], vals[2]], ease) : vals[vals.length - 1];
  const loX = slide(STEPS.map((s) => cellX(s.lo)));
  const hiX = slide(STEPS.map((s) => cellX(s.hi)));
  const midX = slide(STEPS.map((s) => cellX(s.mid)));

  const cells = VALUES.map((v) => ({ label: String(v) }));
  const dim = started ? VALUES.map((_, i) => i).filter((i) => i < step.lo || i > step.hi) : [];
  const found = started && step.found;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {/* Target + the mid formula, updating each step. */}
      <div style={{ position: "absolute", left: AT.x, top: 150, transform: "translateX(-50%)" }}>
        <Label text={`target = ${TARGET}`} size={40} color={tokens.color.ink} />
      </div>
      {started && (
        <div style={{ position: "absolute", left: AT.x, top: 214, transform: "translateX(-50%)", fontFamily: tokens.font.family, fontSize: 32, fontWeight: 600, color: tokens.color.support, whiteSpace: "nowrap" }}>
          mid = (lo + hi) / 2 = ({step.lo} + {step.hi}) / 2 = <span style={{ color: cc("orange"), fontWeight: 800 }}>{step.mid}</span>
        </div>
      )}

      {/* lo / hi bracket the window from above. */}
      {started && <Pointer at={{ x: loX, y: TOP }} label="lo" direction="down" color="green" size={30} />}
      {started && <Pointer at={{ x: hiX, y: TOP }} label="hi" direction="down" color="blue" size={30} />}

      <Cells cells={cells} orientation="row" cellSize={CELL} gap={GAP} at={AT} dim={dim} highlight={found ? [step.mid] : []} highlightColor="green" progress={1} />

      {/* mid points up from below. */}
      {started && <Pointer at={{ x: midX, y: BOT }} label={found ? "found" : "mid"} direction="up" color={found ? "green" : "orange"} size={32} />}

      {/* The comparison at this step. */}
      {started && (
        <div style={{ position: "absolute", left: AT.x, top: 760, transform: "translateX(-50%)", fontFamily: tokens.font.family, fontSize: 34, fontWeight: 700, color: found ? cc("green") : tokens.color.ink, whiteSpace: "nowrap" }}>
          {step.note}
        </div>
      )}
    </AbsoluteFill>
  );
}

// tiny concept-colour helper (kept local so the seed stays self-contained)
function cc(c: "green" | "orange" | "blue"): string {
  return tokens.concept[c].stroke;
}
