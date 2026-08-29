// SEED · pipeline-flow — MOVEMENT: a board-style pointer walks the pipeline. A
// caret slides under each stage, pointing at it as it's discussed, and the stage
// lights up — the way you point along a diagram on a whiteboard. Composes Node
// (stages that activate) + Arrow (connectors) + Pointer (the sliding caret). Edit
// the `STAGES` and `cue` words; keep the pointer-walks-and-stages-light shape.
import {
  AbsoluteFill,
  Node,
  Arrow,
  Pointer,
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

const Y = 480;
const HW = 72;
const BELOW = Y + 66; // where the caret sits, just under the stage row
const STAGES = [
  { label: "Client", x: 430, color: "blue" as const },
  { label: "Server", x: 960, color: "orange" as const },
  { label: "Database", x: 1500, color: "green" as const },
];

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const ease = { ...clamp, easing: EASE_PRESETS.easeInOut };

  const connect = voiced ? interpolate(now, [0.2, 0.9], [0, 1], ease) : 1;
  const t0 = wordAt(words, "request") ?? wordAt(words, "travels") ?? 1.0;
  const c = STAGES.map((s) => s.x);

  // The caret holds on a stage, then slides to the next — pointing at each in turn.
  const seq = [t0, t0 + 0.8, t0 + 1.3, t0 + 2.1, t0 + 2.6];
  const px = voiced ? interpolate(now, seq, [c[0], c[0], c[1], c[1], c[2]], ease) : c[2];
  const pointerIn = voiced ? interpolate(now, [t0 - 0.2, t0 + 0.1], [0, 1], clamp) : 1;

  // A stage lights up once the caret has reached it (stays lit — the path so far).
  const arrival = [t0, t0 + 1.3, t0 + 2.6];
  const lit = (i: number) => !voiced || now >= arrival[i];

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Arrow from={{ x: STAGES[0].x + HW, y: Y }} to={{ x: STAGES[1].x - HW, y: Y }} variant="straight" color="blue" progress={connect} />
      <Arrow from={{ x: STAGES[1].x + HW, y: Y }} to={{ x: STAGES[2].x - HW - 20, y: Y }} variant="straight" color="orange" progress={connect} />
      {STAGES.map((s, i) => (
        <div key={s.label} style={{ position: "absolute", left: s.x, top: Y, transform: "translate(-50%, -50%)" }}>
          <Node color={s.color} filled={lit(i)}>{s.label}</Node>
        </div>
      ))}
      {/* The pointer that walks the pipeline, labelled with what it is. */}
      <Pointer at={{ x: px, y: BELOW }} label="request" direction="up" color="purple" size={34} style={{ opacity: pointerIn }} />
    </AbsoluteFill>
  );
}
