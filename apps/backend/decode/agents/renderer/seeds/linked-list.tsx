// SEED · linked-list — TRACE: a `current` pointer walks a linked list node by
// node, following each `next` arrow until it reaches null. Composes Node (the
// list nodes, the current one lit) + Arrow (the next pointers) + Pointer (the
// walking cursor). Edit the `VALUES` and `cue` words; keep the walk-to-null shape
// and the narration timing.
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

const VALUES = [7, 3, 9, 4];
const Y = 470;
const X0 = 430;
const DX = 320;
const HW = 46; // node half-width, where arrows meet
const nodeX = (i: number) => X0 + i * DX;
const NULL_X = nodeX(VALUES.length - 1) + DX;

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const build = voiced ? interpolate(now, [0.2, 1.0], [0, 1], ease) : 1;
  const t0 = wordAt(words, "current") ?? wordAt(words, "walk") ?? 1.2;
  const STEP = 0.9;

  // Which node the cursor is on, and its gliding x.
  let cur = 0;
  for (let i = 0; i < VALUES.length; i++) if (!voiced || now >= t0 + i * STEP) cur = i;
  const started = !voiced || now >= t0;
  const xs = VALUES.map((_, i) => nodeX(i));
  const slide = () => {
    if (!voiced) return xs[xs.length - 1];
    const bp: number[] = [];
    const out: number[] = [];
    xs.forEach((x, i) => {
      if (i > 0) {
        bp.push(t0 + i * STEP - 0.3);
        out.push(xs[i - 1]);
      }
      bp.push(t0 + i * STEP);
      out.push(x);
    });
    return interpolate(now, bp, out, ease);
  };
  const curX = slide();

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {/* next pointers between nodes, and the final → null. */}
      {VALUES.slice(0, -1).map((_, i) => (
        <Arrow key={i} from={{ x: nodeX(i) + HW, y: Y }} to={{ x: nodeX(i + 1) - HW, y: Y }} variant="straight" color="blue" progress={build} />
      ))}
      <Arrow from={{ x: nodeX(VALUES.length - 1) + HW, y: Y }} to={{ x: NULL_X - 30, y: Y }} variant="straight" color="blue" progress={build} />
      {/* nodes; the current one is filled. */}
      {VALUES.map((v, i) => (
        <div key={i} style={{ position: "absolute", left: nodeX(i), top: Y, transform: "translate(-50%, -50%)" }}>
          <Node color="blue" filled={started && i === cur}>{v}</Node>
        </div>
      ))}
      <div style={{ position: "absolute", left: NULL_X, top: Y, transform: "translate(-50%, -50%)", fontFamily: tokens.font.family, fontSize: 30, fontWeight: 700, color: tokens.color.support, opacity: build }}>null</div>
      {/* the walking cursor */}
      {started && <Pointer at={{ x: curX, y: Y + 66 }} label="current" direction="up" color="orange" size={32} />}
    </AbsoluteFill>
  );
}
