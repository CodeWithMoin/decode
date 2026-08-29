import {
  AbsoluteFill,
  Table,
  tokens,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  EASE_PRESETS,
  type ConceptColor,
} from "@decode/animation-api";

type Word = { word: string; startInSeconds: number; endInSeconds: number };

type SceneProps = {
  words?: Word[];
  revealDuration?: number;
  tcpColor?: ConceptColor;
  udpColor?: ConceptColor;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const target = norm(token);
  const hit = words.find((w) => norm(w.word) === target);
  return hit ? hit.startInSeconds : null;
}

const COLUMNS = ["TCP", "UDP"];
const ROW_LABELS = ["Reliability", "Speed"];
const ROWS = [
  ["Confirms every packet", "May drop data"],
  ["Slower", "Faster"],
];

export default function Scene({
  words,
  revealDuration = 1.6,
  tcpColor = "blue",
  udpColor = "green",
}: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;

  const reliableAt = wordAt(words, "reliable") ?? 0.4;
  const fasterAt = wordAt(words, "faster") ?? 3.4;

  const progress = voiced
    ? interpolate(now, [reliableAt, reliableAt + revealDuration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_PRESETS.easeInOut,
      })
    : 1;

  const highlight: { row: number; col: number }[] = [];
  if (!voiced || now >= reliableAt) highlight.push({ row: 0, col: 0 });
  if (!voiced || now >= fasterAt) highlight.push({ row: 1, col: 1 });

  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <Table
        columns={COLUMNS}
        rows={ROWS}
        rowLabels={ROW_LABELS}
        colColors={[tcpColor, udpColor]}
        highlight={highlight}
        progress={progress}
        at={{ x: 960, y: 520 }}
      />
    </AbsoluteFill>
  );
}
