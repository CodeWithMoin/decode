import { AbsoluteFill, Node, Arrow, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";

// Dev-only check: all six arrow variants drawing on — and proof that components
// compose freely (many Nodes + Arrows in a single Scene).
export const ARROW_VARIANTS_DURATION = 150;

function Demo({ label, x, y, children }: { label: string; x: number; y: number; children: React.ReactNode }) {
  return (
    <>
      <div style={{ position: "absolute", left: x, top: y - 40, fontFamily: tokens.font.family, fontSize: 22, fontWeight: 700, color: tokens.color.support }}>{label}</div>
      {children}
    </>
  );
}

function Dot({ x, y, color }: { x: number; y: number; color?: "blue" | "orange" | "green" }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)" }}>
      <Node color={color} filled style={{ width: 64, height: 64, borderRadius: "50%", padding: 0 }} />
    </div>
  );
}

export function ArrowVariantsPreview() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  // Each arrow draws on over ~1.3s, staggered so you can watch them one by one,
  // then the frame holds.
  const p = (start: number) =>
    interpolate(now, [start, start + 1.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_PRESETS.easeInOut });

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Demo label="straight" x={140} y={240}>
        <Dot x={180} y={260} color="blue" /><Dot x={520} y={260} color="green" />
        <Arrow from={{ x: 212, y: 260 }} to={{ x: 488, y: 260 }} variant="straight" color="blue" progress={p(0.2)} />
      </Demo>
      <Demo label="curved" x={720} y={240}>
        <Dot x={760} y={260} color="blue" /><Dot x={1100} y={260} color="green" />
        <Arrow from={{ x: 792, y: 260 }} to={{ x: 1068, y: 260 }} variant="curved" color="blue" label="w = 0.8" progress={p(0.6)} />
      </Demo>
      <Demo label="elbow" x={1300} y={170}>
        <Dot x={1360} y={200} color="blue" /><Dot x={1700} y={400} color="green" />
        <Arrow from={{ x: 1392, y: 200 }} to={{ x: 1700, y: 368 }} variant="elbow" color="orange" progress={p(1.0)} />
      </Demo>
      <Demo label="double" x={140} y={640}>
        <Dot x={180} y={660} color="blue" /><Dot x={520} y={660} color="orange" />
        <Arrow from={{ x: 212, y: 660 }} to={{ x: 488, y: 660 }} variant="double" color="purple" progress={p(1.4)} />
      </Demo>
      <Demo label="self-loop" x={780} y={640}>
        <Dot x={880} y={660} color="green" />
        <Arrow from={{ x: 880, y: 628 }} to={{ x: 880, y: 628 }} variant="self-loop" color="green" label="stay" progress={p(1.8)} />
      </Demo>
      <Demo label="dashed" x={1320} y={640}>
        <Dot x={1360} y={660} color="blue" /><Dot x={1700} y={660} color="green" />
        <Arrow from={{ x: 1392, y: 660 }} to={{ x: 1668, y: 660 }} variant="dashed" color="orange" progress={p(2.2)} />
      </Demo>
    </AbsoluteFill>
  );
}
