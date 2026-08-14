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
  sceneAtAll,
  startsAll,
  totalAll,
} from "@/lib/derive";
import { DEFAULT_SCENE_VISUAL_STYLE, keyframedValue, sceneVisualStyle } from "@/lib/scene-style";
import type {
  BrandKit,
  Approvals,
  RenderState,
  Scene,
  SceneKeyframeProperty,
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
  /** Signed shuttle speed. Negative values play backward. */
  playbackRate: number;
  /** Resolved Motion Designer questions, keyed by scene index. */
  visualPick: Record<number, "A" | "B">;
  /** Artifact drift, persisted at project level so it survives panel changes. */
  staleByScene: Record<string, StaleKind[]>;
  /** Live overrides for a generated scene's declared controls, keyed by scene id then control name. Falls back to the module's declared default when absent. */
  controlValues: Record<string, Record<string, string | number | boolean>>;
  /** Undo/redo history. Each entry snapshots scene data before a mutation. */
  _history: HistorySnapshot[];
  _future: HistorySnapshot[];

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
  setVisualParameter: (i: number, property: SceneKeyframeProperty, value: number) => void;
  toggleVisualKeyframe: (i: number, property: SceneKeyframeProperty) => void;
  resetVisualParameter: (i: number, property: SceneKeyframeProperty) => void;
  nudgeDur: (i: number, delta: number) => void;
  setClipFade: (i: number, edge: "in" | "out", seconds: number) => void;
  select: (i: number, opts?: { openCanvas?: boolean; preservePlayhead?: boolean }) => void;
  /** Take a beat out of the video, or put it back. Reversible, never destructive. */
  toggleScene: (i: number) => void;
  toggleMute: (i: number) => void;
  toggleLock: (i: number) => void;
  undo: () => void;
  redo: () => void;
  _pushHistory: () => void;
  seek: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setPlaybackRate: (rate: number) => void;

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
  addScene: (after?: number) => void;

  setRegen: (label: string | null) => void;
  applyRegen: (i: number, kind: "scene" | "visuals" | "voice") => void;
  pickVisual: (pos: number, key: "A" | "B") => void;
  setControlValue: (sceneId: string, name: string, value: string | number | boolean) => void;

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

interface HistorySnapshot {
  sc: Scene[];
  sceneIdx: number;
  playhead: number;
  visualPick: Record<number, "A" | "B">;
  staleByScene: Record<string, StaleKind[]>;
}

const addStale = (
  current: StaleKind[] | undefined,
  next: StaleKind[],
): StaleKind[] => Array.from(new Set([...(current ?? []), ...next]));

const visualProgressAt = (scenes: Scene[], index: number, playhead: number) => {
  const scene = scenes[index];
  if (!scene) return 0;
  const local = Math.max(0, Math.min(scene.dur, playhead - startsAll(scenes)[index]));
  const frameCount = Math.max(1, Math.round(scene.dur * 24));
  return Math.round((local / scene.dur) * frameCount) / frameCount;
};

const upsertVisualKeyframe = (points: { at: number; value: number }[], at: number, value: number) => [
  ...points.filter((point) => Math.abs(point.at - at) >= 0.000001),
  { at, value },
].sort((a, b) => a.at - b.at);

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
  playbackRate: 0,
  visualPick: {},
  staleByScene: {},
  controlValues: {},
  _history: [],
  _future: [],

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
  go: (screen) => set({ screen, playing: false, playbackRate: 0, threadOpen: false }),
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
      playbackRate: 0,
      threadOpen: false,
    }),
  setTab: (tab) => set({ tab, playing: false, playbackRate: 0, threadOpen: false }),

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
      playbackRate: 0,
      threadOpen: false,
      staleByScene: {},
    })),

  patch: (i, fields) => {
    get()._pushHistory();
    set((s) => {
      const current = s.sc[i];
      if (!current) return s;
      const narrationChanged =
        fields.narration !== undefined && fields.narration !== current.narration;
      const visualChanged =
        (fields.prompt !== undefined && fields.prompt !== current.prompt) ||
        (fields.title !== undefined && fields.title !== current.title) ||
        (fields.caption !== undefined && fields.caption !== current.caption) ||
         (fields.viz !== undefined && fields.viz !== current.viz) ||
         (fields.anim !== undefined && fields.anim !== current.anim) ||
         (fields.visualStyle !== undefined && fields.visualStyle !== current.visualStyle) ||
         (fields.visualKeyframes !== undefined && fields.visualKeyframes !== current.visualKeyframes);
      const stale = narrationChanged
        ? addStale(s.staleByScene[current.id], ["visual", "assets", "voice"])
        : visualChanged
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
      });
  },

  setVisualParameter: (i, property, value) => {
    const { sc, playhead } = get();
    const scene = sc[i];
    if (!scene) return;
    const points = scene.visualKeyframes?.[property] ?? [];
    let updated: Scene;
    if (points.length === 0) {
      updated = { ...scene, visualStyle: { ...scene.visualStyle, [property]: value } };
    } else {
      const at = visualProgressAt(sc, i, playhead);
      updated = {
        ...scene,
        visualKeyframes: {
          ...scene.visualKeyframes,
          [property]: upsertVisualKeyframe(points, at, value),
        },
      };
    }
    set((state) => ({
      sc: state.sc.map((item, index) => index === i ? updated : item),
      staleByScene: {
        ...state.staleByScene,
        [scene.id]: addStale(state.staleByScene[scene.id], ["visual", "assets"]),
      },
    }));
  },

  toggleVisualKeyframe: (i, property) => {
    const { sc, playhead } = get();
    const scene = sc[i];
    if (!scene) return;
    const at = visualProgressAt(sc, i, playhead);
    const points = scene.visualKeyframes?.[property] ?? [];
    const existing = points.find((point) => Math.abs(point.at - at) < 0.000001);
    const nextPoints = existing
      ? points.filter((point) => point !== existing)
      : upsertVisualKeyframe(points, at, keyframedValue(scene, property, sceneVisualStyle(scene)[property], at));
    get().patch(i, {
      visualKeyframes: {
        ...scene.visualKeyframes,
        [property]: nextPoints,
      },
    });
  },

  resetVisualParameter: (i, property) => {
    const scene = get().sc[i];
    if (!scene) return;
    const visualKeyframes = { ...scene.visualKeyframes };
    delete visualKeyframes[property];
    get().patch(i, {
      visualStyle: { ...scene.visualStyle, [property]: DEFAULT_SCENE_VISUAL_STYLE[property] },
      visualKeyframes,
    });
  },

  nudgeDur: (i, delta) => {
    get()._pushHistory();
    set((s) => {
      const current = s.sc[i];
      if (!current) return s;
      const dur = Math.max(10, Math.min(150, current.dur + delta));
      const fadeIn = Math.min(current.fadeIn ?? 0, dur);
      const fadeOut = Math.min(current.fadeOut ?? 0, dur - fadeIn);
      return {
        sc: s.sc.map((scene, ix) =>
          ix === i
            ? { ...scene, dur, fadeIn, fadeOut }
            : scene,
        ),
        staleByScene: {
          ...s.staleByScene,
          [current.id]: addStale(s.staleByScene[current.id], ["voice"]),
        },
      };
    });
  },

  setClipFade: (i, edge, seconds) => {
    const scene = get().sc[i];
    if (!scene) return;
    const other = edge === "in" ? (scene.fadeOut ?? 0) : (scene.fadeIn ?? 0);
    const next = Math.max(0, Math.min(scene.dur - other, seconds));
    set((state) => ({
      sc: state.sc.map((item, index) => index === i
        ? edge === "in" ? { ...item, fadeIn: next } : { ...item, fadeOut: next }
        : item),
    }));
  },

  toggleScene: (i) => {
    get()._pushHistory();
    return set((s) => {
      const scene = s.sc[i];
      if (!scene) return s;
      const sc = s.sc.map((item, index) =>
        index === i ? { ...item, disabled: !item.disabled } : item,
      );
      // Playhead is on the full visual canvas — toggling a scene never
      // changes where it sits, so no clamping is needed.
      return { sc };
    });
  },

  toggleMute: (i) => {
    get()._pushHistory();
    return set((s) => {
      const scene = s.sc[i];
      if (!scene) return s;
      return {
        sc: s.sc.map((item, index) =>
          index === i ? { ...item, muted: !item.muted } : item,
        ),
      };
    });
  },

  toggleLock: (i) => {
    get()._pushHistory();
    return set((s) => {
      const scene = s.sc[i];
      if (!scene) return s;
      return {
        sc: s.sc.map((item, index) =>
          index === i ? { ...item, locked: !item.locked } : item,
        ),
      };
    });
  },



  select: (i, opts) =>
    set((s) => {
      const playhead = opts?.preservePlayhead ? s.playhead : (startsAll(s.sc)[i] ?? 0);
      // Selecting the scene that is already selected is a no-op, the same way
      // `seek` guards itself. Without this, anything that re-selects on a
      // render — a timeline click, an observation, a keyboard step — publishes
      // a fresh state object and re-renders the whole project shell for
      // nothing.
      if (
        s.sceneIdx === i &&
        s.playhead === playhead &&
        !s.playing &&
        !(opts?.openCanvas && s.tab !== "edit")
      ) {
        return s;
      }
      return {
        sceneIdx: i,
        playhead,
        playing: false,
        playbackRate: 0,
        ...(opts?.openCanvas ? { tab: "edit" as TabId } : {}),
      };
    }),

  seek: (t) =>
    set((s) => {
      const tt = Math.max(0, Math.min(totalAll(s.sc), t));
      const sceneIdx = sceneAtAll(s.sc, tt);
      if (Math.abs(s.playhead - tt) < 0.0001 && s.sceneIdx === sceneIdx) return s;
      return { playhead: tt, sceneIdx };
    }),

  setPlaying: (playing) => set({ playing, playbackRate: playing ? 1 : 0 }),
  setPlaybackRate: (playbackRate) => set({ playbackRate, playing: playbackRate !== 0 }),

  _pushHistory: () => {
    const s = get();
    const snap: HistorySnapshot = {
      sc: JSON.parse(JSON.stringify(s.sc)),
      sceneIdx: s.sceneIdx,
      playhead: s.playhead,
      visualPick: { ...s.visualPick },
      staleByScene: { ...s.staleByScene },
    };
    const history = s._history.slice();
    if (history.length >= 50) history.shift();
    set({ _history: [...history, snap], _future: [] });
  },

  undo: () => {
    const s = get();
    const snap = s._history.at(-1);
    if (!snap) return;
    const current: HistorySnapshot = {
      sc: JSON.parse(JSON.stringify(s.sc)),
      sceneIdx: s.sceneIdx,
      playhead: s.playhead,
      visualPick: { ...s.visualPick },
      staleByScene: { ...s.staleByScene },
    };
    set({
      sc: JSON.parse(JSON.stringify(snap.sc)),
      sceneIdx: snap.sceneIdx,
      playhead: snap.playhead,
      visualPick: { ...snap.visualPick },
      staleByScene: { ...snap.staleByScene },
      _history: s._history.slice(0, -1),
      _future: [current, ...s._future].slice(0, 50),
      playing: false,
      playbackRate: 0,
    });
  },

  redo: () => {
    const s = get();
    const snap = s._future[0];
    if (!snap) return;
    const current: HistorySnapshot = {
      sc: JSON.parse(JSON.stringify(s.sc)),
      sceneIdx: s.sceneIdx,
      playhead: s.playhead,
      visualPick: { ...s.visualPick },
      staleByScene: { ...s.staleByScene },
    };
    set({
      sc: JSON.parse(JSON.stringify(snap.sc)),
      sceneIdx: snap.sceneIdx,
      playhead: snap.playhead,
      visualPick: { ...snap.visualPick },
      staleByScene: { ...snap.staleByScene },
      _history: [...s._history, current].slice(-50),
      _future: s._future.slice(1),
      playing: false,
      playbackRate: 0,
    });
  },
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
    get()._pushHistory();
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
        playhead: startsAll(sc)[sel] ?? 0,
        playing: false,
        playbackRate: 0,
        dragPos: null,
        dragOverPos: null,
        // Plan-level edits reset plan *and* script approval.
        approvals: { ...s.approvals, plan: false, script: false },
      };
    });
    get().say(
      "Reordered the scenes and re-timed everything downstream. The plan and script are ready for review again.",
      "Scene order changed",
    );
  },

  /* --- scene ops: none of these reset an approval --- */

  splitScene: (i) => {
    get()._pushHistory();
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
      fadeOut: 0,
      reason: "Split — two ideas were sharing one beat.",
    };
    const b: Scene = {
      ...s,
      id: uid("sc"),
      title: `${s.title} · payoff`,
      narration: toks.slice(mid).join(" "),
      dur: s.dur - half,
      fadeIn: 0,
      reason: "Second half of a beat that ran too dense.",
    };
    set((st) => {
      const sc = st.sc.slice();
      sc.splice(i, 1, a, b);
      return {
        sc,
        sceneIdx: i,
        playhead: startsAll(sc)[i] ?? 0,
        playing: false,
        playbackRate: 0,
      };
    });
    get().say(
      `Split scene ${num(i)} in two — the concept was too dense to land in one beat. Timing divided between them.`,
      "1 scene → 2 scenes",
    );
  },

  mergeScene: (i) => {
    get()._pushHistory();
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
      fadeIn: a.fadeIn,
      fadeOut: b.fadeOut,
      reason: "Merged — the two beats were making one point.",
    };
    set((st) => {
      const next = st.sc.slice();
      next.splice(i, 2, merged);
      const sceneIdx = Math.min(i, next.length - 1);
      return {
        sc: next,
        sceneIdx,
        playhead: startsAll(next)[sceneIdx] ?? 0,
        playing: false,
        playbackRate: 0,
      };
    });
    get().say(
      `Merged scenes ${num(i)} and ${num(i + 1)}. They were circling the same idea.`,
      "2 scenes → 1 scene",
    );
  },

  dupScene: (i) => {
    get()._pushHistory();
    set((s) => {
      const sc = s.sc.slice();
      sc.splice(i + 1, 0, {
        ...sc[i],
        id: uid("sc"),
        reason: "Duplicated by you — edit freely, the original is untouched.",
      });
      return {
        sc,
        sceneIdx: i + 1,
        playhead: startsAll(sc)[i + 1] ?? 0,
        playing: false,
        playbackRate: 0,
      };
    });
    get().say(
      `Duplicated scene ${num(i)} beside the original. Timing after it updated automatically.`,
      "1 scene duplicated",
    );
  },

  /* --- plan-level ops: these do reset approvals --- */

  removeScene: (i) => {
    get()._pushHistory();
    if (get().sc.length <= 2) return;
    set((s) => {
      const sc = s.sc.slice();
      sc.splice(i, 1);
      const sceneIdx = Math.min(s.sceneIdx, sc.length - 1);
      return {
        sc,
        sceneIdx,
        playhead: startsAll(sc)[sceneIdx] ?? 0,
        playing: false,
        playbackRate: 0,
        approvals: { ...s.approvals, plan: false, script: false },
      };
    });
    get().say(
      "Removed that scene and re-timed everything after it. The plan and script are ready for review again.",
      "1 scene removed",
    );
  },

  addScene: (after) => {
    get()._pushHistory();
    set((s) => {
      const sc = s.sc.slice();
      const insertAt = Math.min(sc.length, Math.max(0, (after ?? sc.length - 1) + 1));
      sc.splice(insertAt, 0, {
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
          "Narration for this scene hasn’t been written yet. Give Decode a note, or write it in Script.",
        alt: "",
        altUsed: false,
      });
      return {
        sc,
        sceneIdx: insertAt,
        playhead: startsAll(sc)[insertAt] ?? 0,
        playing: false,
        playbackRate: 0,
        approvals: { ...s.approvals, plan: false, script: false },
      };
    });
    get().say(
      "Added a new scene and re-timed everything after it. The plan and script are ready for review again.",
      "1 scene added",
    );
  },

  setRegen: (regen) => set({ regen }),

  /**
   * Swap the scene's two drafts so the change is visibly real — and
   * reversible: regenerating again brings the first draft back.
   * `visuals` skips the text swap entirely.
   */
  applyRegen: (i, kind) => {
    get()._pushHistory();
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
    get()._pushHistory();
    set((s) => ({ visualPick: { ...s.visualPick, [pos]: key } }));
    get().say(
      `Option ${key} it is — rebuilding scene ${num(pos)} only.`,
      `Scene ${num(pos)} · visual queued`,
    );
  },

  setControlValue: (sceneId, name, value) =>
    set((s) => ({
      controlValues: {
        ...s.controlValues,
        [sceneId]: { ...s.controlValues[sceneId], [name]: value },
      },
    })),

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
    get()._pushHistory();
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
    get()._pushHistory();
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
      playbackRate: 0,
      visualPick: {},
      staleByScene: {},
      controlValues: {},
      thread: SEED_THREAD(),
      tab: "overview",
      renderState: "idle",
      renderPct: 0,
      pstep: 0,
      _history: [],
      _future: [],
    }),
}));
