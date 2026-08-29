// SEED · list-reveal — staged points revealing top-to-bottom, each on its cue word
// (NOT a static bullet dump). Composes Node (number chips) + Label. Edit the
// `ITEMS` (text + cue) and the title; keep the staged reveal.
import { AbsoluteFill, Node, Label, tokens, interpolate, useCurrentFrame, useVideoConfig, EASE_PRESETS } from "@decode/animation-api";
type Word = { word: string; startInSeconds: number; endInSeconds: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function wordAt(words: Word[] | undefined, token: string): number | null {
  if (!words?.length) return null;
  const hit = words.find((w) => norm(w.word) === norm(token));
  return hit ? hit.startInSeconds : null;
}
const TITLE = "Three ways to scale";
const ITEMS = [
  { text: "Add more machines", cue: "horizontally", color: "blue" as const },
  { text: "Make each machine bigger", cue: "vertically", color: "orange" as const },
  { text: "Cache what you can", cue: "cache", color: "green" as const },
];
const ROW_H = 150;
const TOP = 380;
export default function Scene({ words }: { words?: Word[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const voiced = !!words?.length;
  const ease = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: EASE_PRESETS.easeInOut };
  const titleIn = voiced ? interpolate(now, [0.2, 0.7], [0, 1], ease) : 1;
  return (
    <AbsoluteFill style={{ background: tokens.color.surface }}>
      <div style={{ position: "absolute", left: 620, top: 250, fontFamily: tokens.font.family, fontSize: 52, fontWeight: 800, color: tokens.color.ink, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 14}px)` }}>{TITLE}</div>
      {ITEMS.map((it, i) => {
        const t0 = wordAt(words, it.cue) ?? 1.0 + i * 1.2;
        const rev = voiced ? interpolate(now, [t0, t0 + 0.5], [0, 1], ease) : 1;
        const y = TOP + i * ROW_H;
        return (
          <div key={i} style={{ position: "absolute", left: 640, top: y, display: "flex", alignItems: "center", gap: 28, opacity: rev, transform: `translateY(${(1 - rev) * 20}px)` }}>
            <Node color={it.color} filled style={{ width: 72, height: 72, borderRadius: "50%", padding: 0, fontSize: 34, fontWeight: 800 }}>{i + 1}</Node>
            <div style={{ fontFamily: tokens.font.family, fontSize: 44, fontWeight: 600, color: tokens.color.ink }}>{it.text}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
