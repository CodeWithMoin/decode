"use client";

import { create } from "zustand";
import {
  DEFAULT_SOURCE,
  SEED_SCENES,
  SEED_THREAD,
  uid,
} from "@/lib/api";
import {
  actTwoRange,
  num,
  sceneAt,
  starts,
  total,
} from "@/lib/derive";
import type {
  BrandKit,
  Approvals,
  RenderState,
  Scene,
  ScreenId,
  Source,
  StaleKind,
  TabId,
  ThreadMessage,
} from "@/lib/types";

interface StudioState {
  screen: ScreenId;
  tab: TabId;

  /* composer */
  sources: Source[];
  brandKit: BrandKit | null;
  brief: string;
  audience: string;
  runtime: string;
  depth: string;
  tone: string;

  source: Source;

  /* project */
  sc: Scene[];
  approvals: Approvals;
  sceneIdx: number;
  playhead: number;
  playing: boolean;
  /** Resolved Motion Designer questions, keyed by scene index. */
  visualPick: Record<number, "A" | "B">;
  /** Artifact drift, persisted at project level so it survives panel changes. */
  staleByScene: Record<string, StaleKind[]>;

  /* interaction */
  dragPos: number | null;
  dragOverPos: number | null;
  regen: string | null;
  pstep: number;

  /* producer */
  threadOpen: boolean;
  thread: ThreadMessage[];
  draft: string;
  thinking: boolean;

  /* export */
  exportRes: string;
  exportFmt: string;
  captions: boolean;
  chapters: boolean;
  renderState: RenderState;
  renderPct: number;

  /* ---- actions ---- */
  go: (screen: ScreenId) => void;
  newDecode: () => void;
  setTab: (tab: TabId) => void;

  attach: (s: Source) => void;
  detach: (file?: string) => void;
  setBrandKit: (k: BrandKit | null) => void;
  setBrief: (v: string) => void;
  setAudience: (v: string) => void;
  setRuntime: (v: string) => void;
  setDepth: (v: string) => void;
  setTone: (v: string) => void;
  startDecode: () => void;

  patch: (i: number, fields: Partial<Scene>) => void;
  nudgeDur: (i: number, delta: number) => void;
  select: (i: number, opts?: { openCanvas?: boolean }) => void;
  seek: (t: number) => void;
  setPlaying: (p: boolean) => void;
  tick: () => void;
  stop: () => void;

  approve: (
    stage: keyof Approvals,
    msg: string,
    receipt: string,
    nextTab: TabId,
  ) => void;

  reorder: (from: number, to: number) => void;
  setDragPos: (i: number | null) => void;
  setDragOverPos: (i: number | null) => void;

  splitScene: (i: number) => void;
  mergeScene: (i: number) => void;
  dupScene: (i: number) => void;
  removeScene: (i: number) => void;
  addScene: () => void;

  setRegen: (label: string | null) => void;
  applyRegen: (i: number, kind: "scene" | "visuals" | "voice") => void;
  pickVisual: (pos: number, key: "A" | "B") => void;

  setPstep: (n: number) => void;

  toggleThread: () => void;
  setThreadOpen: (v: boolean) => void;
  say: (text: string, receipt?: string) => void;
  ask: (text: string) => void;
  setDraft: (v: string) => void;
  setThinking: (v: boolean) => void;
  lockedNudge: () => void;

  tightenActTwo: () => void;
  shortenCurrent: () => void;

  setExportRes: (v: string) => void;
  setExportFmt: (v: string) => void;
  toggleCaptions: () => void;
  toggleChapters: () => void;
  setRender: (state: RenderState, pct: number) => void;

  reset: () => void;
}

const initialApprovals = (): Approvals => ({
  understanding: false,
  plan: false,
  script: false,
});

const addStale = (
  current: StaleKind[] | undefined,
  next: StaleKind[],
): StaleKind[] => Array.from(new Set([...(current ?? []), ...next]));

export const useStudio = create<StudioState>((set, get) => ({
  screen: "landing",
  tab: "overview",

  sources: [],
  brandKit: null,
  brief: "",
  audience: "AI engineers who know backprop",
  runtime: "5 min",
  depth: "Balanced",
  tone: "Professional",

  source: DEFAULT_SOURCE,

  sc: SEED_SCENES(),
  approvals: initialApprovals(),
  sceneIdx: 0,
  playhead: 0,
  playing: false,
  visualPick: {},
  staleByScene: {},

  dragPos: null,
  dragOverPos: null,
  regen: null,
  pstep: 0,

  threadOpen: false,
  thread: SEED_THREAD(),
  draft: "",
  thinking: false,

  exportRes: "1080p",
  exportFmt: "MP4 · H.264",
  captions: true,
  chapters: true,
  renderState: "idle",
  renderPct: 0,

  /* ---------------------------------------------------------------- */

  // The room is contextual, never permanent chrome. Leaving a screen closes
  // it so Home and the next project stage always regain the full workspace.
  go: (screen) => set({ screen, playing: false, threadOpen: false }),
  newDecode: () =>
    set({
      screen: "upload",
      sources: [],
      brandKit: null,
      brief: "",
      audience: "AI engineers who know backprop",
      runtime: "5 min",
      depth: "Balanced",
      tone: "Professional",
      playing: false,
      threadOpen: false,
    }),
  setTab: (tab) => set({ tab, playing: false, threadOpen: false }),

  // Multi-source: a lesson is often a paper plus your own notes, and forcing
  // one file meant re-uploading a merged PDF to say something that simple.
  attach: (src) =>
    set((s) =>
      s.sources.some((x) => x.file === src.file)
        ? s
        : { sources: [...s.sources, src] },
    ),
  detach: (file) =>
    set((s) => ({
      sources: file
        ? s.sources.filter((x) => x.file !== file)
        : s.sources.slice(0, -1),
    })),
  setBrandKit: (brandKit) => set({ brandKit }),
  setBrief: (brief) => set({ brief }),
  setAudience: (audience) => set({ audience }),
  setRuntime: (runtime) => set({ runtime }),
  setDepth: (depth) => set({ depth }),
  setTone: (tone) => set({ tone }),
  startDecode: () =>
    set((s) => ({
      source: s.sources[0] ?? s.source,
      screen: "processing",
      tab: "overview",
      pstep: 0,
      approvals: initialApprovals(),
      playing: false,
      threadOpen: false,
      staleByScene: {},
    })),

  patch: (i, fields) =>
    set((s) => {
      const current = s.sc[i];
      if (!current) return s;
      const narrationChanged =
        fields.narration !== undefined && fields.narration !== current.narration;
      const promptChanged =
        fields.prompt !== undefined && fields.prompt !== current.prompt;
      const stale = narrationChanged
        ? addStale(s.staleByScene[current.id], ["visual", "assets", "voice"])
        : promptChanged
          ? addStale(s.staleByScene[current.id], ["visual", "assets"])
          : s.staleByScene[current.id];
      return {
        sc: s.sc.map((scene, ix) =>
          ix === i ? { ...scene, ...fields } : scene,
        ),
        staleByScene:
          stale === s.staleByScene[current.id]
            ? s.staleByScene
            : { ...s.staleByScene, [current.id]: stale },
      };
    }),

  nudgeDur: (i, delta) =>
    set((s) => {
      const current = s.sc[i];
      if (!current) return s;
      return {
        sc: s.sc.map((scene, ix) =>
          ix === i
            ? { ...scene, dur: Math.max(10, Math.min(150, scene.dur + delta)) }
            : scene,
        ),
        staleByScene: {
          ...s.staleByScene,
          [current.id]: addStale(s.staleByScene[current.id], ["voice"]),
        },
      };
    }),

  select: (i, opts) =>
    set((s) => ({
      sceneIdx: i,
      playhead: starts(s.sc)[i] ?? 0,
      playing: false,
      ...(opts?.openCanvas ? { tab: "edit" as TabId } : {}),
    })),

  seek: (t) =>
    set((s) => {
      const tt = Math.max(0, Math.min(total(s.sc), t));
      return { playhead: tt, sceneIdx: sceneAt(s.sc, tt) };
    }),

  setPlaying: (playing) => set({ playing }),
  stop: () => set({ playing: false }),

  tick: () =>
    set((s) => {
      const t = s.playhead + 0.1;
      const cap = total(s.sc);
      if (t >= cap) return { playhead: cap, playing: false };
      return { playhead: t, sceneIdx: sceneAt(s.sc, t) };
    }),

  approve: (stage, msg, receipt, nextTab) => {
    set((s) => ({
      approvals: { ...s.approvals, [stage]: true },
      tab: nextTab,
      threadOpen: false,
      ...(stage === "script" ? { staleByScene: {} } : {}),
    }));
    get().say(msg, receipt);
  },

  setDragPos: (dragPos) => set({ dragPos }),
  setDragOverPos: (dragOverPos) => set({ dragOverPos }),

  /** True splice-insert, not a swap. Selection follows the moved beat. */
  reorder: (from, to) => {
    if (from === to) {
      set({ dragPos: null, dragOverPos: null });
      return;
    }
    set((s) => {
      const sc = s.sc.slice();
      const [moved] = sc.splice(from, 1);
      sc.splice(to, 0, moved);

      let sel = s.sceneIdx;
      if (sel === from) sel = to;
      else if (from < sel && to >= sel) sel -= 1;
      else if (from > sel && to <= sel) sel += 1;

      return {
        sc,
        sceneIdx: sel,
        dragPos: null,
        dragOverPos: null,
        // Plan-level edits reset plan *and* script approval.
        approvals: { ...s.approvals, plan: false, script: false },
      };
    });
    get().say(
      "Reordered the plan. Everything downstream re-timed — nothing else changed.",
      "Beat order changed",
    );
  },

  /* --- scene ops: none of these reset an approval --- */

  splitScene: (i) => {
    const s = get().sc[i];
    if (!s) return;
    const toks = s.narration.trim().split(/\s+/);
    const mid = Math.ceil(toks.length / 2);
    const half = Math.round(s.dur / 2);
    const a: Scene = {
      ...s,
      id: uid("sc"),
      title: `${s.title} · setup`,
      narration: toks.slice(0, mid).join(" "),
      dur: half,
      reason: "Split — two ideas were sharing one beat.",
    };
    const b: Scene = {
      ...s,
      id: uid("sc"),
      title: `${s.title} · payoff`,
      narration: toks.slice(mid).join(" "),
      dur: s.dur - half,
      reason: "Second half of a beat that ran too dense.",
    };
    set((st) => {
      const sc = st.sc.slice();
      sc.splice(i, 1, a, b);
      return { sc };
    });
    get().say(
      `Split scene ${num(i)} in two — the concept was too dense to land in one beat. Timing divided between them.`,
      "1 scene → 2 scenes",
    );
  },

  mergeScene: (i) => {
    const { sc } = get();
    if (i >= sc.length - 1) {
      get().say("That’s the last scene — nothing after it to merge into.");
      return;
    }
    const a = sc[i];
    const b = sc[i + 1];
    const merged: Scene = {
      ...a,
      narration: `${a.narration} ${b.narration}`,
      dur: a.dur + b.dur,
      reason: "Merged — the two beats were making one point.",
    };
    set((st) => {
      const next = st.sc.slice();
      next.splice(i, 2, merged);
      return { sc: next, sceneIdx: Math.min(i, next.length - 1) };
    });
    get().say(
      `Merged scenes ${num(i)} and ${num(i + 1)}. They were circling the same idea.`,
      "2 scenes → 1 scene",
    );
  },

  dupScene: (i) =>
    set((s) => {
      const sc = s.sc.slice();
      sc.splice(i + 1, 0, {
        ...sc[i],
        id: uid("sc"),
        reason: "Duplicated by you — edit freely, the original is untouched.",
      });
      return { sc, sceneIdx: i + 1 };
    }),

  /* --- plan-level ops: these do reset approvals --- */

  removeScene: (i) => {
    if (get().sc.length <= 2) return;
    set((s) => {
      const sc = s.sc.slice();
      sc.splice(i, 1);
      return {
        sc,
        sceneIdx: Math.min(s.sceneIdx, sc.length - 1),
        approvals: { ...s.approvals, plan: false, script: false },
      };
    });
    get().say(
      "Cut that beat and re-timed the rest. Say the word if you want it back.",
      "1 beat removed",
    );
  },

  addScene: () =>
    set((s) => {
      const sc = s.sc.slice();
      sc.push({
        id: uid("sc"),
        title: "New beat",
        dur: 30,
        anim: "Fade sequence",
        reason: "Added by you — tell me what it should teach and I’ll draft it.",
        objective: "set the objective for this beat.",
        caption: "Untitled beat",
        prompt: "Describe the visual for this beat.",
        viz: ["?"],
        hot: 0,
        narration:
          "Narration for this beat hasn’t been written yet. Give the producer a note, or write it here yourself.",
        alt: "",
        altUsed: false,
      });
      return {
        sc,
        sceneIdx: sc.length - 1,
        approvals: { ...s.approvals, plan: false, script: false },
      };
    }),

  setRegen: (regen) => set({ regen }),

  /**
   * Swap the scene's two drafts so the change is visibly real — and
   * reversible: regenerating again brings the first draft back.
   * `visuals` skips the text swap entirely.
   */
  applyRegen: (i, kind) => {
    set((s) => {
      const current = s.sc[i];
      if (!current) return { regen: null };
      const rebuilt: StaleKind[] =
        kind === "scene"
          ? ["visual", "assets", "voice"]
          : kind === "visuals"
            ? ["visual", "assets"]
            : ["voice"];
      const staleByScene = {
        ...s.staleByScene,
        [current.id]: (s.staleByScene[current.id] ?? []).filter(
          (stale) => !rebuilt.includes(stale),
        ),
      };
      if (kind === "visuals" || kind === "voice") {
        return { regen: null, staleByScene };
      }
      const sc = s.sc.map((scene, ix) => {
        if (ix !== i || !scene.alt) return scene;
        return {
          ...scene,
          narration: scene.alt,
          alt: scene.narration,
          altUsed: !scene.altUsed,
          reason: "Redrafted at your request — same objective, plainer path.",
        };
      });
      return { sc, regen: null, staleByScene };
    });
  },

  pickVisual: (pos, key) => {
    set((s) => ({ visualPick: { ...s.visualPick, [pos]: key } }));
    get().say(
      `Option ${key} it is — rebuilding scene ${num(pos)} only.`,
      `Scene ${num(pos)} · visual queued`,
    );
  },

  setPstep: (pstep) => set({ pstep }),

  toggleThread: () => set((s) => ({ threadOpen: !s.threadOpen })),
  setThreadOpen: (threadOpen) => set({ threadOpen }),

  say: (text, receipt) =>
    set((s) => ({
      thread: [...s.thread, { id: uid("m"), who: "p", text, receipt }],
    })),

  ask: (text) =>
    set((s) => ({ thread: [...s.thread, { id: uid("m"), who: "u", text }] })),

  setDraft: (draft) => set({ draft }),
  setThinking: (thinking) => set({ thinking }),

  /** Clicking a locked stage explains, in the Producer's voice. */
  lockedNudge: () => {
    set({ threadOpen: true });
    get().say(
      "That stage opens once you’ve approved the one before it — I build each on the last so nothing gets orphaned.",
    );
  },

  tightenActTwo: () => {
    const [from, to] = actTwoRange(get().sc);
    set((s) => {
      const staleByScene = { ...s.staleByScene };
      for (let ix = from; ix < to; ix += 1) {
        const scene = s.sc[ix];
        if (scene) {
          staleByScene[scene.id] = addStale(staleByScene[scene.id], ["voice"]);
        }
      }
      return {
        sc: s.sc.map((scene, ix) =>
          ix >= from && ix < to
            ? { ...scene, dur: Math.max(10, scene.dur - 5) }
            : scene,
        ),
        staleByScene,
      };
    });
    get().say(
      "Trimmed five seconds from each mechanism beat and re-paced the narration.",
      "Act II · −20s",
    );
  },

  shortenCurrent: () => {
    const i = get().sceneIdx;
    get().nudgeDur(i, -8);
    get().say(
      "Took eight seconds off and re-paced the narration to match.",
      "Scene retimed",
    );
  },

  setExportRes: (exportRes) => set({ exportRes, renderState: "idle", renderPct: 0 }),
  setExportFmt: (exportFmt) => set({ exportFmt, renderState: "idle", renderPct: 0 }),
  toggleCaptions: () =>
    set((s) => ({ captions: !s.captions, renderState: "idle", renderPct: 0 })),
  toggleChapters: () =>
    set((s) => ({ chapters: !s.chapters, renderState: "idle", renderPct: 0 })),
  setRender: (renderState, renderPct) => set({ renderState, renderPct }),

  reset: () =>
    set({
      sc: SEED_SCENES(),
      approvals: initialApprovals(),
      sceneIdx: 0,
      playhead: 0,
      playing: false,
      visualPick: {},
      staleByScene: {},
      thread: SEED_THREAD(),
      tab: "overview",
      renderState: "idle",
      renderPct: 0,
      pstep: 0,
    }),
}));
