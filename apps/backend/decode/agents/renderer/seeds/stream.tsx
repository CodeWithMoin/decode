// SEED · stream — FLOW: data streams continuously from producer to consumer,
// particles moving down the wire. Composes Node (the endpoints) + Arrow (the
// wire) + Flow (the moving particles). Edit the endpoints, the flow mode/speed
// and the `cue` words; keep the Flow-along-the-wire composition. Flow reads the
// frame clock itself and loops — the template for any continuous transfer.
import {
  AbsoluteFill,
  Node,
  Arrow,
  Flow,
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

const Y = 460;
const A = { x: 520, y: Y }; // producer
const B = { x: 1400, y: Y }; // consumer
const WIRE_FROM = { x: A.x + 100, y: Y };
const WIRE_TO = { x: B.x - 110, y: Y };

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };

  const wire = voiced ? interpolate(now, [0.2, 0.9], [0, 1], ease) : 1;
  const flowAt = wordAt(words, "streams") ?? wordAt(words, "data") ?? 1.0;
  const flowing = !voiced || now >= flowAt;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      {/* The wire the data rides. */}
      <Arrow from={WIRE_FROM} to={WIRE_TO} variant="straight" color="blue" progress={wire} />
      {/* The continuous stream of data along the wire. */}
      <Flow path={[WIRE_FROM, WIRE_TO]} mode="particles" color="orange" count={5} speed={0.35} width={9} active={flowing} />
      {/* Endpoints. */}
      <div style={{ position: "absolute", left: A.x, top: Y, transform: "translate(-50%, -50%)" }}>
        <Node color="blue">Producer</Node>
      </div>
      <div style={{ position: "absolute", left: B.x, top: Y, transform: "translate(-50%, -50%)" }}>
        <Node color="green">Consumer</Node>
      </div>
    </AbsoluteFill>
  );
}
