# Decode — app structure

The whole application in one place: what exists, what doesn't, what each piece
owns, and what blocks what. Reference this when asking for changes — every unit
below is named so a request can point at one.

Status: **✅ built** · **🟡 partial** · **⬜ not started**

---

## 1. How it hangs together

Four seams, and nothing crosses them sideways.

```
lib/types.ts        the shapes. Nothing else defines a shape.
       ↓
lib/api.ts          the ONLY module that produces data. Today it returns seeded
                    content synchronously; when FastAPI lands these become fetch
                    calls and SSE subscriptions — and no component changes,
                    because components only ever see lib/types.ts.
       ↓
store/studio.ts     all mutable state + every action. 491 lines, complete.
       ↓
components/*        render state, call actions. They compute nothing durable.
       ↑
lib/derive.ts       everything computed from state: runtime, starts, word counts,
                    acts, pacing, gating. Called at render, never stored.
```

**The rule that makes this work:** nothing derived is ever written back into the
store. `total = Σ dur` and `starts[i] = Σ dur[0..i-1]` are recomputed on every
render, so reordering or retiming a scene updates the header, arc bar,
timecodes, transcript and timeline with nothing having to remember to notify
anything. There is no sync step and there must never be one.

---

## 2. The tree

```
apps/frontend/src/
├── app/
│   ├── layout.tsx                    ✅ fonts, metadata, html shell
│   ├── page.tsx                      ✅ renders <Studio/>
│   └── preview/page.tsx              🗑️ THROWAWAY thesis route — delete
│
├── components/
│   ├── Studio.tsx                    ✅ screen router — all five screens wired
│   │
│   ├── screens/
│   │   ├── landing/                  ✅ COMPLETE (see §3)
│   │   │   ├── Landing.tsx           ✅ page composition
│   │   │   ├── SourceToScene.tsx     ✅ hero diptych: source → scene
│   │   │   ├── SourceStrip.tsx       ✅ "works with" kinds
│   │   │   ├── HowItWorks.tsx        ✅ three decisions
│   │   │   ├── StudioDemo.tsx        ✅ one-scene-edit demo
│   │   │   ├── WhyItWorks.tsx        ✅ creative software, not a chatbot
│   │   │   └── motion.ts             ✅ all landing GSAP, one file
│   │   ├── dashboard/Dashboard.tsx   ✅
│   │   ├── upload/NewDecode.tsx      ✅
│   │   └── processing/Processing.tsx ✅
│   │
│   ├── project/
│   │   ├── ProjectShell.tsx          ✅ header · gated rail · stage slot
│   │   ├── Inspector.tsx             ✅ right panel, Edit only (318px)
│   │   ├── stages/
│   │   │   ├── Understanding.tsx     ✅ Producer
│   │   │   ├── TeachingPlan.tsx      ✅ Educator
│   │   │   ├── Script.tsx            ✅ Script Writer
│   │   │   ├── Edit.tsx              ✅ Storyboard Artist
│   │   │   ├── Assets.tsx            ✅ Motion Designer
│   │   │   └── Export.tsx            ✅ Voice Director
│   │   ├── canvas/
│   │   │   ├── SceneVisual.tsx       ✅ 8 renderers + 2 alternates, progress-driven
│   │   │   └── Canvas.tsx            ✅ dark frame, chips, real footer row
│   │   └── timeline/Timeline.tsx     ✅ ruler · 3 lanes · playhead · drag-scrub
│   │
│   ├── crew/
│   │   ├── HandoffCard.tsx           ✅ the approve gate
│   │   └── SpecialistNote.tsx        ✅ the A/B option card (scenes 3 & 5)
│   │
│   ├── producer/ProducerDrawer.tsx   ✅ global overlay, ⌘J
│   │
│   └── ui/
│       ├── primitives.tsx            ✅ Graphite Accent ChipCTA Ghost AppMark
│       │                                CrewMark Spinner Toggle Stepper Select
│       │                                Micro Kicker cx
│       └── TactileButton.tsx         ✅ neumorphic, dark canvas only
│
├── lib/
│   ├── types.ts                      ✅ every shape
│   ├── api.ts                        ✅ the data seam (seeded today)
│   ├── crew.ts                       ✅ CREW + STAGE_OWNER — one source
│   └── derive.ts                     ✅ timing · gating · acts · pacing · easing
│
└── store/studio.ts                   ✅ complete
```

---

## 3. Screens

### Landing ✅
Done. Seven sections, documented in `LANDING-PLAN.md`.

### Dashboard ✅
Sticky glass header (mark · `⌘K` search pill · split "＋ New Decode" · avatar).
Body max 1040px. Greeting + "n decodes · total runtime" (derived). **Recent
Decodes** cards `auto-fit minmax(238px,1fr)` — 130px thumbnail on a *soft tinted
gradient, never black* + `SCENE 04` label + frame caption, then title, meta,
status pill. Then **Templates** (4, accent mono glyphs).

Reads: `projectCards(meta)`, `TEMPLATES`. Writes: `go("upload")`, `go("project")`.
Carries the floating "Ask the producer ⌘J" pill.

### New Decode ✅
Vertically centred. 56px app mark, two-line greeting, then the **composer card**
(720px, radius 26px): status strip → chatbar (attach `＋`, textarea, Start pill)
→ four variable pills — Audience (**free text**), Runtime, Depth, Voice.
Starter chips appear only while Audience is empty. Below: Recent files and
examples, which **attach rather than launch** so the brief can be set first.

Reads: `RECENT_FILES`, `EXAMPLES`, `AUDIENCE_HINTS`. Writes: `attach`, `setBrief`,
`setAudience`, `setRuntime`, `setDepth`, `setTone`.
`Select` and the pills already exist in primitives.

### Processing ✅
Centred 480px. **Never a bare spinner.** Seven named steps, each with a status
slot (done ✓ / active spinner / pending dot), a mono detail line revealed on
completion, and an elapsed time. Pending rows at 35%. Staggered ~900–1300ms.
Completion swaps the reassurance line for "Open project →".

Reads: `processingSteps(ctx)` — the step list is a *function of the brief*, so the
detail lines quote the audience and runtime you actually chose — and
`PROCESSING_GAPS` for the stagger. Writes: `setPstep`, `go("project")`.

### Project shell ✅
Header: back pill · title · draft pill · derived `runtime · n scenes` · **active
specialist pill** · Export. Rail 200px glass, 999px pill rows, each with a 19px
specialist mark (colour+initial / accent ✓ approved / hollow locked). Source card
at the bottom. Right inspector slot — Edit only.

Gating is `isLocked(tab, approvals)` from `derive.ts`. Clicking a locked stage
calls `lockedNudge()`.

Verified: approvals gate and auto-advance correctly — `understanding → plan →
script`, and approving script jumps the level to 5, opening Edit, Assets and
Export together. A locked stage now opens the Producer drawer and gets
explained, never a tooltip.

> ⚠️ **Below 1024px there is no stage nav at all** (`hidden lg:flex`). A 200px
> rail + 318px inspector is desktop by construction. Needs a deliberate decision,
> not a default.

---

## 4. Stages

| Stage | Owner | Core | Status |
|---|---|---|---|
| Understanding | Producer | Stat row · concept pills · scene list · handoff pinned **bottom** | ✅ |
| Teaching Plan | Educator | Runtime arc · acts · beat cards · **drag to reorder** · handoff pinned **top** | ✅ |
| Script | Script Writer | Screenplay layout, narration `contentEditable`, no inspector · handoff **top** | ✅ |
| Edit | Storyboard Artist | Canvas + Inspector + Timeline | ✅ |
| Assets | Motion Designer | Filter chips + asset grid (see §6b — only 8 seeded) | ✅ |
| Export | Voice Director | Settings card, render, completion row | ✅ |

Layout traps recorded in the spec — re-introducing any is a regression:

- **Understanding** — the Audience stat is user free text: step the size down at
  16 and 26 chars, **never line-clamp**. Concept pills `white-space: nowrap`.
- **Edit** — the canvas footer must be a **flex sibling**, not absolutely
  positioned. Chips `flex:0 1 auto; min-width:0` with ellipsis.
- **Assets** — kind gets `min-width:0` + ellipsis, size gets `flex:none`.
- **Drawer** — opaque `#FCFCFB`, above the sticky header.

### Edit, in parts
Its own section because it is three components, not one.

- **`Canvas.tsx`** — `#0E0E10`, radius 20, flex column: centred region (mono
  scene label, one non-wrapping row of shrinkable chips, Bricolage caption) and a
  real footer row (play, `0:00 / 5:27`, `1920 × 1080 · 24 fps`). Regeneration
  overlays `rgba(14,14,16,0.82)` + `blur(6px)` with a **specific** label.
- **`Inspector.tsx`** — two tabs. *Transcript*: grouped by scene, word-level
  highlight follows the playhead, click a word to seek, **read-only**. *Scene*:
  specialist note, narration textarea, voice, animation, duration stepper, visual
  prompt, and the regenerate row with its scope reassurance.
- **`Timeline.tsx`** — transport row, 30s ruler, three lanes (waveform 110 bars ·
  scenes proportional · animations), 2px accent playhead with a 10px square cap,
  `onMouseDown` → document-level drag-scrub.

---

## 5. Producer drawer ✅

Global overlay. Fixed right, full height, 340px (max 88vw), z-index 80, **opaque
`#FCFCFB`**, `-24px 0 60px rgba(30,30,28,0.14)`.

- Header: accent `D` mark, "Producer", and a **live context line** that names
  what you are looking at ("Looking at Scene 04 · Multi-Head Attention").
- Thread: producer left (white, bordered), user right (`#141414`). Messages that
  changed something carry a **receipt** — `✓ Act II · −20s`.
- **Context-aware quick actions**, different per screen, and they really act:
  *Tighten act II by 20s* retimes; *Open with the results instead* moves beat 07.
  *Add a beat on why RNNs failed* **pushes back** rather than complying.
- Composer + circular graphite send.

Access: `⌘J`/`Ctrl+J`, `Esc` closes, the header specialist pill toggles, and a
floating pill on **Dashboard and Upload only** — inside the project it would
cover the timeline scrub area.

Store is ready: `threadOpen`, `thread`, `draft`, `thinking`, `toggleThread`,
`setThreadOpen`, `say`, `ask`, `setDraft`, `setThinking`, `lockedNudge`,
`tightenActTwo`, `shortenCurrent`.

---

## 6. The data is already there

Nothing below needs authoring. Every unbuilt screen has its content waiting in
`lib/api.ts` — this is real production teaching copy, not lorem, and it should be
reused verbatim.

| Export | Feeds | Note |
|---|---|---|
| `SEED_SCENES()` | everything | 8 scenes: objective, narration, **`alt`** draft, prompt, viz chips, `dur`, `anim` |
| `DEFAULT_SOURCE` | shell, Understanding | the paper's real metadata |
| `PROJECT_DESCRIPTION` | Understanding | the brief in one sentence |
| `CONCEPTS` `PREREQS` `EQUATIONS` | Understanding | 37 concepts, the pills |
| `DEPENDENCIES` `OPPORTUNITIES` | Understanding | what must be understood first |
| `SEED_THREAD()` | drawer | the seeded producer conversation |
| `SCENE_NOTES` | Edit | **the crew's A/B disagreements for scenes 3 and 5, already written** |
| `ANIM_OPTIONS` | Script, Edit | the animation select |
| `WAVE_BARS` | Timeline | the 110 waveform bars |
| `ASSETS` | Assets | 24 assets |
| `projectCards(meta)` `TEMPLATES` | Dashboard | |
| `RECENT_FILES` `EXAMPLES` `AUDIENCE_HINTS` | New Decode | |
| `RUNTIME_OPTIONS` `DEPTH_OPTIONS` `TONE_OPTIONS` | New Decode | the four variable pills |
| `processingSteps(ctx)` `PROCESSING_GAPS` | Processing | |

Two are worth calling out. **`alt`** on every scene is the second narration draft
— that is what makes regeneration visibly real rather than a spinner that
returns the same words. And **`SCENE_NOTES`** already contains the Motion
Designer's two options and stated preference, so "the crew can disagree" is a
rendering job, not a writing job.

`WORKFLOW_STEPS` is the one export with no remaining consumer — it belonged to a
deleted landing section. Delete it or find it a home.

---

## 6b. Known gaps found during the build

- **`ASSETS` holds 8 entries, not 24.** The spec says "24 assets; 8 shown", so
  the Assets stage honestly reads "showing 8 of 8". Either seed 16 more or
  change the spec — do not print "of 24" over 8 records.
- **The canvas is near-empty at playhead 0.** `SceneVisual` is progress-driven,
  so at `p = 0` the first scene has barely begun drawing. Truthful — that *is*
  frame zero — but it makes Edit look broken on first open. Either seed the
  playhead a little in, or give each renderer a legible state at `p = 0`.
- **`AppMark` cannot render in accent.** Its background is an inline style, so
  no class overrides it; the drawer's accent `D` is a local copy. Wants a
  `tone` prop on the primitive.
- **`--header-h` now exists** (`57px`). Stages had begun hardcoding `top-[57px]`
  independently, which silently breaks every one of them when the header's
  padding changes. Use the token.

---

## 7. Build order

Each line is blocked by the one above it.

1. ✅ Tokens, primitives, crew, derived timing, `SceneVisual`
2. ✅ Project shell
3. ✅ Producer drawer — gating now explains itself instead of silently blocking
4. ✅ Understanding · Teaching Plan · Script
5. ✅ Edit — Canvas + Inspector + Timeline + derived stale state
6. ✅ Assets · Export
7. ✅ Dashboard · New Decode · Processing — the entry flow
8. ✅ Scaffold button removed; the real flow reaches every screen
9. ⬜ Delete `app/preview/` (still a throwaway thesis route)
10. ⬜ Close the gaps in §6b

**The app is walkable end to end**: landing → dashboard → new decode → attach →
processing → project → all six stages, with approvals gating and auto-advancing.
Verified: bumping one beat's duration moved the header from 5:27 to 5:32 on its
own, which is the derived-timing invariant working through the whole chain.

Entry flow is last on purpose: it is lists and forms, and it is easier to design
once a project actually exists to open.

---

## 8. Invariants — these constrain every screen

- **The crew.** Six named specialists from `lib/crew.ts`. Never "Assistant" or
  "AI". All generated copy is first person, past tense for finished work, and
  always says *why*.
- **Nothing is a bare loading state.** No spinner without explanation, ever.
- **All timing is derived.** The user never syncs anything.
- **Stage gating.** `unlockLevel()`. Locked → drawer, never a tooltip. Approving
  advances the tab.
- **Re-approval asymmetry.** Plan-level edits reset `plan` *and* `script`.
  Scene-level edits inside Edit reset nothing.
- **Regeneration scope (settled).** Approvals never reset. A narration edit marks
  that scene's visual spec, assets and voice **stale** — nothing outside it — and
  rebuilds none of it until the user asks. Uses `--color-stale*`, deliberately
  not the error ramp: stale is the expected result of an edit, not a fault.
- **Script writes, Timeline navigates.** Narration is editable in exactly one
  place. Never two editable copies of the same text.
- **Scope reassurance.** Every regeneration states what it did *not* touch.
- **The crew can disagree.** Scenes 3 and 5 offer two options with a stated
  preference. Picking one collapses to a teal confirmation and posts a receipt.
- **No entrance animations inside the studio.** Elements render at settled state.
  Scroll motion is landing-only. Respect `prefers-reduced-motion`.
- **Handoff cards are pinned** — bottom on Understanding, top on Teaching Plan
  and Script. Approve must always be reachable.
- **A novice can drive it. This outranks taste.** Three testable rules:
  **one name per object** — the eight scenes are "scenes" everywhere; "beat"
  may appear only beside its definition ("8 beats — one per scene"). **The next
  step is always visible** — every screen has exactly one obvious primary
  action (the handoff bar's Approve, the dropzone, Create project); if you have
  to explain what to click, the layout is wrong, not the user. **No dead
  ends** — every empty state, zero-result, and locked door says what to do
  instead. No cutting-room vocabulary in rendered copy ("in the cut", "the
  timeline collapses", "regeneration boundary") — say what it means in words a
  student would use.
- **Responsive without media queries.** `repeat(auto-fit, minmax(Xpx, 1fr))` and
  `clamp()`.

---

## 9. Open questions

- **Studio below 1024px** — no stage nav today. Decide, don't default.
- **Crew vs department names on the marketing surface.** Settled inside the app
  (crew names win); the landing page still mixes both.
- **Unhoused, probably drawer:** per-artifact compute cost, and the reviewer
  escalating to a human after its retry limit.
