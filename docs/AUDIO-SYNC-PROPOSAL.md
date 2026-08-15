# Audio / Beat-Synchronization — proposal (not yet implemented)

How sound design + narration↔animation↔SFX↔music timing should fit Decode.
Grounded in the current code; reuses artifacts/departments/jobs, adds no parallel
architecture. Pairs with `AGENT-GRAPH.md` (the snapshot migration) — see §11.

## The headline finding

The Sound Designer is **not** the hard part. The hard part — and the real
prerequisite — is that **nothing in Decode exposes sub-scene *events* to sync
to.** Narration is a single duration; visuals are opaque `useProgress()` code.
You cannot align to a moment that isn't represented. So the foundation is a
**shared per-scene temporal model (a beat timeline of semantic anchors)** that
narration and visuals both reference; SFX, music, the Composer, and the human
timeline all hang off it. Build that first; Sound Designer and Composer are
departments that plug into it.

---

## 1. Where audio exists today
- **Voice department** (`departments/voice`) → one mp3 per beat in the object
  store (`narration/<uuid>.mp3`), served by `voice_router` with HTTP Range.
- **`VoiceNarration{beat_id, audio_key, duration_seconds}`** — the entire audio
  model. No SFX, no music, no Composer, no transcript, no word timestamps.
- Frontend: `ConnectedEdit` maps a clip → `scene.audioUrl` + `scene.dur`; the
  Remotion player plays it; a per-scene `muted` flag exists.

## 2. Current scene / timeline representation
- `Scene[]` in the Zustand store: `dur`, `fadeIn/out`, `narration`, `audioUrl`,
  `componentSource`, `controls`, `visualKeyframes` (prototype style knobs),
  `muted`, `disabled`.
- **Timing is derived** (ADR-005): gapless cumulative unless a scene has explicit
  `start`/`track` after a free drag; runtime = furthest enabled clip end.
- Effectively **one video track + the beat's own narration**. No SFX/music
  tracks, no sub-scene events as data.

## 3. Where narration timing is stored
- **Only `duration_seconds` per clip** (measured from the mp3 via mutagen).
- **No transcript, no word/segment timestamps.** This is the missing linchpin:
  semantic anchoring ("when the narrator says *query*") is impossible today.

## 4. How visual animations expose timing
- Opaque: `component_source` is React driven by `useProgress()` (0→1 over scene
  duration). No named events.
- **Latent primitive:** `Segment({from, to, name})` renders children over a
  normalized sub-range **and takes a name** — today the name only reaches
  Remotion devtools. And `CONTROLS` are already generated as *declared structured
  data, never executed*. So the mechanism to surface named visual beats already
  exists; the Visualizer just doesn't emit them as data yet.

## 5. Minimum architecture for beat synchronization

A per-scene **Beat Timeline** built on **semantic anchors that resolve to
timestamps** — never raw stored timestamps. The user's instinct is exactly right:

```
sound.trigger = "attention_weight_reveal"   →  resolves to 3.42s
```

Anchors resolve against narration word-timestamps (and named visual beats).
Timestamps are **derived**, extending ADR-005 ("timing is derived") from
scene-duration down to sub-scene events. This is what makes the whole thing
resilient to narration changes (§8).

Minimum model, per scene:
- **Narration transcript** with word/segment timestamps — *the enabling
  prerequisite* (§10). Capture Fish Audio's alignment output, or add a
  forced-alignment step; store alongside the clip.
- **Visual beats** — named anchors the Visualizer declares (`beats: [{name,
  at}]`), surfaced as data the same way `CONTROLS` are; reuse the `Segment` name.
- **Anchors** — named points that resolve to a timestamp, from a narration word
  or a visual beat. The shared vocabulary everything references.
- **Sound/music events** attach to anchors (`trigger = anchor name`) with
  duration / intensity / ducking.

Minimum = `{ transcript(word ts), visual beats(named), a resolver(anchor→ts) }`.
SFX, music, human nudges all hang off it.

## 6. Sound Designer artifact schema

A new artifact type `sound_design` (per project; per-scene entries), produced by
a **Sound Designer department** — it emits a **plan, never rendered audio**.

```
sound_design.findings: { fixture, model, skills_version, ... }
sound_design.scenes: [{
  beat_id,
  decision: "silent" | "designed",     // SILENCE IS THE DEFAULT
  rationale,                            // states *why* (first person, past tense)
  sfx: [{
    id,
    trigger,            // anchor name, e.g. "attention_weight_reveal"
    kind,               // reveal | movement | transition | emphasis | spatial | payoff
    asset_ref,          // reusable/local asset id (preferred) OR generated key
    duration_seconds,
    gain_db,
    overlaps_narration, // bool — deliberate, checked
    fade_in, fade_out
  }],
  music: null           // music is project-level, not per-scene (see §ownership)
}]
```

Principles baked in: **default silent**; **anchors not raw timestamps**;
**prefer reusable/local assets** over generation (cost); every entry states why.

## 7. How audio dependencies work
Reuse the existing scene-scoped dependency model (today `ArtifactDependency`;
post-migration, per-scene staleness in the snapshot):
- A scene's `sound_design` entry depends on **that scene's** narration text +
  narration timing (transcript) + visual beats.
- **Music** depends on project **tone/intent** — project-level, not per-scene.
- ⇒ Changing scene 5's narration marks **only** scene 5's sound_design stale.
  Exactly the existing "regenerate only what depends on the change" rule.

## 8. How narration changes propagate
```
edit script (scene N) → re-render voice(N) → new mp3
  → new duration + new transcript(word ts)
  → RE-RESOLVE scene N's anchors
  → visual-beat timestamps + SFX timestamps update automatically
```
Nobody hand-fixes numbers, because SFX/visual beats are **anchor-relative**, not
absolute. Only scene N regenerates. This is the payoff of the anchor model — and
the core reason to keep the dependency graph.

## 9. How human edits propagate
The human timeline (narration waveform + visual-beat lane + SFX lane + music
lane). Each action maps to an anchor/timeline edit (and a tool → store action,
per "everything the room can do, a hand can do"), posting a receipt:
- "move this reveal earlier" → shift the visual beat's anchor/offset → re-resolve
  → dependent SFX follow.
- "remove this sound" → delete the SFX entry (scene-scoped, resets nothing else).
- "start the animation when the narrator says *query*" → set the visual beat's
  `trigger` to the word-anchor `query`; the resolver pins it.

## 10. Now vs. later

**Now (the enabling foundation — independently valuable):**
1. **Narration transcript with word timestamps.** Without it nothing syncs. It
   also sharpens ADR-005 and the direction loop even before sound exists.
2. **The per-scene anchor model + resolver** (anchor → timestamp). Thin is fine.
3. **Visualizer declares named visual beats** (reuse `Segment` name / a beats
   manifest, like CONTROLS).

**Later (plug into the foundation):**
4. **Sound Designer** department + `sound_design` artifact (needs 1–3).
5. **Composer** — final mix/timeline metadata; combines rendered visual +
   narration + SFX + music with priority ducking (**Narration > important SFX >
   music**). Produces a plan; does **not** render.
6. Background music; the human timeline UI (waveform lanes); generated (vs
   reusable) SFX.

Rationale: 1–3 are the substrate everything needs and pay off on their own;
4–6 are departments/UI over that substrate.

## Where it fits the department model
- **Sound Designer** and **Composer** are ordinary departments (SKILL.md
  manifest, fake+real, produce artifacts, scene-scoped deps) — no parallel
  architecture.
- Order: Sound Designer runs **after** voice (needs narration timing) and visuals
  (needs visual beats). **Composer is terminal**, before render/review.
- **Composer produces a plan; the renderer executes it.** The
  `providers/renderer.py` port (the HyperFrames boundary) is where the final
  timeline becomes an MP4 — Composer never renders.
- Self-evaluation with **retry limits** (their spec): a validation hook like the
  Visualizer's static gate — overlap check, loudness/ducking check, repetition
  check, "is this silence better?" — bounded, no infinite loops.

## 11. Sequencing vs. the snapshot migration (important)
**Do not build this on the artifact machinery we're about to migrate.** The beat
timeline belongs **in the project snapshot** (`AGENT-GRAPH.md` §8): each scene
gets a `timeline` sub-document — transcript, visual beats, sound events — all
anchor-based, checkpointed. Your instinct that `ArtifactVersion` becomes a
checkpoint/diff is right, and the anchor model makes per-scene staleness precise.

On your other notes:
- **auto_continue** — agreed, gone (UI already removed; column retires in §8).
- **Dependencies via LLM autonomy** — keep dependencies *declared/deterministic*
  (what depends on what); let the LLM decide *content*, not track the graph, or
  staleness becomes unreliable. Separate the two.
- **Separate DB per department** — no. One snapshot document with per-scene
  sections; binary audio in the object store + a small **asset table** for
  reuse/caching. N tables would fragment the one thing we're trying to unify.
- **Evaluation at the end / not always** — yes: an optional hook/tool, not a
  per-stage gate.
- **Gerund department renames** (initiating/architecting/writing/…) — cosmetic;
  fine, low priority.
- **screenshot + alignment tools** — these become central: `screenshot_scene`
  (vision check) and `check_alignment` read the beat timeline; they're the §4/§6
  tools in AGENT-GRAPH.

## One-line summary
Ship the **word-timestamp transcript + per-scene anchor timeline + named visual
beats** first (the substrate). Then Sound Designer (silence-default plan) and
Composer (priority mix) are departments that resolve anchors to timestamps — so
the video feels *edited*, and a one-sentence narration change re-resolves instead
of breaking every downstream number.
