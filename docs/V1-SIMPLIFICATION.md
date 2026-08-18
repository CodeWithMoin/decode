# V1 Simplification Plan

**Thesis.** Decode is not a video editor. It turns a prompt into a finished
educational video, then lets the human direct revisions in chat. Everything that
serves an *editor* or a *staged wizard* is scaffolding for a product we're not
building. Cut it. Keep the pipeline, the player, the chat, and a way to save.

> **V1 in one line:** one input → the pipeline runs automatically → the video
> plays → the chat directs changes. Project = video. No tabs, no timeline, no
> approvals.

---

## The flow (what v1 actually is)

1. **Dashboard** — a grid of projects, each a video. "New decode."
2. **New** — one box: *"Explain backpropagation."* Submit.
3. **Build** — the pipeline runs **automatically, end to end** (understanding →
   plan → script → scene visuals → audio → video). A named progress checklist,
   no approval gates, no stage-by-stage clicking.
4. **Project = the video** — it plays. Below/beside it, the **chat**.
5. **Direct** — "make scene 3 shorter", "the analogy is wrong", "add a beat on
   why RNNs failed." The chat revises; the video updates; the change persists.

That's it. The notebook pipeline already does steps 3; the connected app is
heavyweight scaffolding for a different (staged-editor) vision.

---

## The key distinction

Two things the user called "not needed" must be pulled apart:

- **UI / gating → CUT.** The staged tabs, approval gates, unlock levels, and the
  timeline editor are droppable with no data loss.
- **Data model → KEEP (mostly).** The plan and script still *exist* — the pipeline
  can't generate beats without them; they just stop being user-facing editable
  tabs. The artifact/version store is the **persistence** that fixes "reload
  reverts" — deleting it to replace with a blob is net work + regression risk for
  no v1 benefit. **Don't rip it out; stop exposing and gating on it.** Revisit
  only if it actively blocks us (it doesn't — the UI does).

---

## Routes — `app/studio/`

| Route | v1 |
|---|---|
| `page.tsx` (dashboard) | **KEEP** — grid of videos |
| `new/page.tsx` | **KEEP, simplify** — one input box, submit auto-builds |
| `projects/[projectId]/page.tsx` | **KEEP, becomes the whole project** — player + chat |
| `projects/[projectId]/edit/page.tsx` | **FOLD into project page** — strip timeline + tabs; player + light per-scene controls + chat |
| `projects/[projectId]/jobs/[jobId]/page.tsx` | **KEEP as inline build progress** (the auto-build checklist) |
| `understanding/page.tsx` | **CUT** (deep-link only or remove) |
| `teaching-plan/page.tsx` | **CUT** |
| `script/page.tsx` | **CUT** — narration is edited in chat, not a tab |

## Frontend components

| Component | v1 |
|---|---|
| `connected/ConnectedProject.tsx` | **SIMPLIFY** → video + chat shell (drops the re-declared stage rail/header — the known drift) |
| `connected/ConnectedEdit.tsx` | **STRIP** → remove timeline + plan/script inspector tabs; keep player + minimal controls |
| `connected/ConnectedProcessing.tsx` | **KEEP** → the auto-build checklist (no "approve to continue") |
| `connected/ConnectedTeachingPlan.tsx`, `ConnectedScript.tsx` | **CUT** (archive) |
| `connected/ConnectedProjectFrame / Viewport / Resume` | **KEEP** (shell/resume) |
| `project/timeline/Timeline.tsx`, `AudioWaveform.tsx` | **CUT** — the NLE view and all its features (free-drag, tracks, fades, waveforms) |
| `player/DecodePlayer.tsx`, `DecodeComposition.tsx`, `player-ref.tsx`, `use-current-player-frame.ts` | **KEEP** — the player. Use Remotion Player's built-in transport (play/seek); no track editor |
| `player/decode-timeline.ts` | **KEEP the sequencing math** (runtime, scene placement); it feeds the composition, not the editor |
| `StageRail` / `StudioNav` / unlock-level nav | **CUT** — no stages to navigate |

## Backend — `apps/backend/decode/`

Keep the pipeline and persistence; remove the gating and the editor's needs.

| Area | v1 |
|---|---|
| `execution/*` (the pipeline) | **KEEP** — it produces plan/script/visuals/audio; this is the engine |
| `orchestrator_router.py` | **KEEP** — chat is the edit surface (now streaming) |
| `renders/`, `voice_router.py`, `composition_router.py`, `direct_router.py` | **KEEP** |
| `projects/router.py` | **KEEP** |
| `artifacts/router.py` — **approvals** endpoints | **STOP USING / hide** — no approve-to-advance in v1 |
| `artifacts/router.py` — **versions** endpoint | **KEEP** — it's the persistence; chat revisions publish new versions (fixes reload-reverts) |
| Stage gating / unlock levels / re-approval asymmetry | **DROP from the flow** — pipeline runs unconditionally |
| Fade / control / track / z-order persistence (Tier 3) | **DROP entirely** — served only the editor we're cutting |

---

## The three behavior changes that make it v1

1. **Auto-run on submit.** Submitting the brief kicks the *entire* pipeline; no
   per-stage approval. The build screen is progress, not a wizard.
2. **Project view = player + chat.** No tabs, no timeline, no inspector stages.
   The video is the artifact; the chat is how you change it.
3. **Chat is the only edit surface, and its changes persist.** Structural
   revisions re-publish the affected artifact version (the Tier-1/2 work from the
   snapshot investigation) so a reload shows the revised video, not the old one.

---

## What NOT to delete (protect)

- **The direction loop.** Auto-build is the first frame, not "take it or leave
  it." The moat is the human directing revisions in chat. Keep it central.
- **The pipeline's internal plan/script.** Cut the tabs, keep the data — the
  generator needs them, and "show me the outline" can surface them read-only later.
- **The persistence layer.** Versions ARE how reload works. Don't trade a working
  store for a blob mid-flight.
- **The correctness-by-derivation / narration-as-timing invariants.** Unaffected
  by this cut; they live in the pipeline, not the UI.

---

## Sequencing

- **Phase 1 — flatten the flow.** Auto-run the pipeline on submit; remove approval
  gates and unlock nav. Project route shows build progress → player + chat. (No
  deletions yet — just stop gating and stop routing to stages.)
- **Phase 2 — cut the surfaces.** Remove the timeline editor, the plan/script/
  understanding routes and components, the stage rail. Strip `ConnectedEdit` to
  player + chat.
- **Phase 3 — persist chat revisions.** Wire the Apply path to re-publish the
  affected artifact version (Tier 1: script-level; Tier 2: plan-level) so
  revisions survive reload. Drop Tier 3 (fade/control) with the editor.

Phase 1 is reversible and low-risk; do it first and the product already *feels*
like v1 before any code is deleted.

---

## Open decisions for you

1. **Auto-build with zero gates, or one "here's the plan — build it?" confirm**
   before the expensive render? (Recommend: zero gates for v1; the chat can still
   redirect after.)
2. **Keep a read-only "outline" peek** (plan/script visible but not editable), or
   hide them completely for v1? (Recommend: hide; add on request.)
3. **Delete the cut code now, or archive/feature-flag it** in case the editor
   returns? (Recommend: archive — it's real work you may want later.)
