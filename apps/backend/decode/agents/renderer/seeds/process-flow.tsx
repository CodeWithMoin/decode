// SEED · process-flow — a value passing through labelled stages, connected by
// weighted arrows that draw on as the narration names each one. Hand-perfected.
// Edit the labels, the concept colours, the positions and the `cue` words to
// teach a different process; keep the Node/Arrow composition and the timing.
import {
  AbsoluteFill,
  Node,
  Arrow,
  tokens,
  spring,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  EASE_PRESETS,
  type ConceptColor,
} from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };
type Pt = { x: number; y: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Seconds a cue word is first spoken; null pre-voice (falls back to `fallback`).
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

// The diagram in 1920x1080 px. `cue` is the narration word that reveals each
// element; `fallback` is its pre-voice time in seconds.
const PLACES: {
  id: string; label: string; color: ConceptColor; at: Pt; cue: string; fallback: number;
}[] = [
  { id: "in",  label: "Dosage",     color: "blue",   at: { x: 360,  y: 640 }, cue: "dosage",     fallback: 0.4 },
  { id: "mid", label: "Activation", color: "orange", at: { x: 960,  y: 340 }, cue: "activation", fallback: 1.8 },
  { id: "out", label: "Efficacy",   color: "green",  at: { x: 1540, y: 640 }, cue: "efficacy",   fallback: 3.4 },
];

const LINKS: {
  from: string; to: string; color: ConceptColor; label: string; cue: string; fallback: number;
}[] = [
  { from: "in",  to: "mid", color: "blue",   label: "× -34.4", cue: "multiply", fallback: 1.0 },
  { from: "mid", to: "out", color: "orange", label: "× 2.28",  cue: "flows",    fallback: 2.6 },
];

const ARROW_DRAW = 0.9;

function edge(a: Pt, b: Pt, inset: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / len) * inset, y: a.y + (dy / len) * inset };
}

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const place = (id: string) => PLACES.find((p) => p.id === id)!.at;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {LINKS.map((l) => {
        const at = wordAt(words, l.cue) ?? l.fallback;
        const progress = voiced
          ? interpolate(now, [at, at + ARROW_DRAW], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_PRESETS.easeInOut,
            })
          : 1;
        return (
          <Arrow
            key={`${l.from}-${l.to}`}
            from={edge(place(l.from), place(l.to), 96)}
            to={edge(place(l.to), place(l.from), 96)}
            color={l.color}
            label={l.label}
            progress={progress}
          />
        );
      })}
      {PLACES.map((pl) => {
        const at = wordAt(words, pl.cue) ?? pl.fallback;
        const enter = voiced
          ? spring({ frame: Math.round((now - at) * fps), fps, config: { damping: 18, mass: 1, stiffness: 120 } })
          : 1;
        const scale = 0.85 + 0.15 * enter;
        const filled = pl.id === "out" && (!voiced || now >= at);
        return (
          <div
            key={pl.id}
            style={{
              position: "absolute",
              left: pl.at.x,
              top: pl.at.y,
              transform: `translate(-50%, -50%) scale(${scale.toFixed(4)})`,
              opacity: enter,
            }}
          >
            <Node color={pl.color} filled={filled}>
              {pl.label}
            </Node>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
