// SEED · encode — MORPH: a character flips over to become its binary encoding
// (A → 01000001). Composes Node (the two faces) + Morph (the flip). Edit the two
// faces, the label and the `cue` words; keep the Morph flip and the narration
// timing. The template for any A→B transform: encode/decode, raw→normalised,
// before→after. (Morph accepts any two nodes, not just text.)
import {
  AbsoluteFill,
  Node,
  Morph,
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

export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const flipAt = wordAt(words, "binary") ?? wordAt(words, "bits") ?? 1.2;
  const progress = voiced
    ? interpolate(now, [flipAt, flipAt + 0.9], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 960, top: 300, transform: "translateX(-50%)" }}>
        <Label text="character → binary" size={40} color={tokens.color.support} />
      </div>
      <Morph
        before={
          <Node color="blue" style={{ fontSize: 96, fontWeight: 800, padding: "28px 56px" }}>
            A
          </Node>
        }
        after={
          <Node color="green" style={{ fontSize: 60, fontWeight: 700, padding: "34px 48px", fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: 2 }}>
            01000001
          </Node>
        }
        progress={progress}
        mode="flip"
        at={{ x: 960, y: 540 }}
      />
    </AbsoluteFill>
  );
}
