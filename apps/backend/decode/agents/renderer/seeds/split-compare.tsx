// SEED · split-compare — a two-up comparison: two titled panels (baseline vs ours) with a headline figure in each. Edit the panel titles/colours and the content placed in each half.
// Composes SplitPanel (the frame) + Place'd Stats (the content of each half). Keep the
// panels-then-content reveal; change titles, colours and the figures compared.
import {
  AbsoluteFill,
  SplitPanel,
  splitPanelCenters,
  Place,
  Stat,
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
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const start = wordAt(words, "baseline") ?? 0.3;
  const panelP = voiced ? interpolate(now, [start, start + 1.0], [0, 1], ease) : 1;
  const statAt = wordAt(words, "ours") ?? start + 1.4;
  const statP = voiced ? interpolate(now, [statAt, statAt + 1.6], [0, 1], ease) : 1;

  const centers = splitPanelCenters(2); // body centre of each panel — always in sync
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <SplitPanel
        panels={[
          { title: "Baseline", color: "orange" },
          { title: "Ours", color: "green" },
        ]}
        progress={panelP}
      />
      <Place at={centers[0]}>
        <Stat value={78} suffix="%" label="accuracy" accent="orange" progress={statP} />
      </Place>
      <Place at={centers[1]}>
        <Stat value={92} suffix="%" label="accuracy" accent="green" progress={statP} />
      </Place>
    </AbsoluteFill>
  );
}
