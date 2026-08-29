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

/**
 * A motion bench for the taste layer — a statquest-style diagram, not a scene.
 * Scrub how <Node> enters/activates and how <Arrow> draws on, so look and
 * motion are judged together in Studio. Tune tokens in taste.tsx; tune timing
 * (the FRAME constants) here.
 */

export const TASTE_PREVIEW_DURATION = 150; // 5s @ 30fps

type Pt = { x: number; y: number };

// Diagram laid out in 1920×1080 frame pixels (this bench draws in absolute
// space, the way references do inside a diagram).
const PLACES: { id: string; label: string; color: ConceptColor; at: Pt }[] = [
  { id: "in", label: "Dosage", color: "blue", at: { x: 360, y: 640 } },
  { id: "mid", label: "Activation", color: "orange", at: { x: 960, y: 340 } },
  { id: "out", label: "Efficacy", color: "green", at: { x: 1540, y: 640 } },
];

const LINKS: { from: string; to: string; color: ConceptColor; label: string; drawAt: number }[] = [
  { from: "in", to: "mid", color: "blue", label: "× -34.4", drawAt: 34 },
  { from: "mid", to: "out", color: "orange", label: "× 2.28", drawAt: 60 },
];

const STAGGER = 8;
const DRAW_DUR = 40; // frames an arrow takes to draw on (slower = calmer)
const ACTIVATE_AT = 120; // frame the output node fills
const EXIT_DUR = 22;

// Endpoint inset so the line starts/ends at the node's edge, not its center.
function edge(a: Pt, b: Pt, inset: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / len) * inset, y: a.y + (dy / len) * inset };
}

export function TastePreview() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - EXIT_DUR;

  const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_PRESETS.easeInOut,
  });

  const place = (id: string) => PLACES.find((p) => p.id === id)!.at;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface, opacity: exit }}>
      {/* Arrows first, under the nodes. */}
      {LINKS.map((l) => {
        const a = place(l.from);
        const b = place(l.to);
        const progress = interpolate(frame, [l.drawAt, l.drawAt + DRAW_DUR], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_PRESETS.easeInOut,
        });
        return (
          <Arrow
            key={`${l.from}-${l.to}`}
            from={edge(a, b, 96)}
            to={edge(b, a, 96)}
            color={l.color}
            label={l.label}
            progress={progress}
          />
        );
      })}

      {/* Nodes stagger in on springs. */}
      {PLACES.map((p, i) => {
        const enter = spring({
          frame: frame - i * STAGGER,
          fps,
          config: { damping: 18, mass: 1, stiffness: 120 },
        });
        const scale = 0.85 + 0.15 * enter;
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: p.at.x,
              top: p.at.y,
              transform: `translate(-50%, -50%) scale(${scale.toFixed(4)})`,
              opacity: enter,
            }}
          >
            <Node color={p.color} filled={p.id === "out" && frame >= ACTIVATE_AT}>
              {p.label}
            </Node>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
