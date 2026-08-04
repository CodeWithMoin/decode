# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is **not an application repository** — it is a design handoff bundle for **Decode**, an AI-native learning studio that turns technical source material (papers, books, docs, slides) into editable educational videos.

```
design_handoff_decode_studio/
  README.md                # The spec. Read it in full before any implementation work.
  Decode Studio.dc.html    # Complete clickable prototype — all screens, state, content
  support.js               # Prototype-only template runtime. DO NOT PORT.
.omc/                      # oh-my-claudecode tool state, not project content
```

There is no package.json, no build, no lint, no test suite. To view the prototype, open `design_handoff_decode_studio/Decode Studio.dc.html` directly in a browser — it is self-contained apart from Google Fonts and clickable end to end. The root component exposes tweak props (`accent`, `startScreen`, `glassPanels`) to jump to any screen.

`design_handoff_decode_studio/README.md` is the authoritative spec: design tokens, per-screen layout, interaction rules, and state model. Consult it rather than re-deriving intent from the HTML.

## Prototype runtime (read-only)

`Decode Studio.dc.html` is authored in a bespoke internal runtime loaded from `support.js`: `<x-dc>` root, `<sc-for list as item>`, `<sc-if value>`, `{{ }}` interpolation holes, and a `class Component extends DCLogic` block in a `<script type="text/x-dc">` tag (starts around line 1150). Treat this runtime as a rendering shim for the design tool. When implementing, translate its constructs to the target framework's idioms (`sc-for` → `.map()`/`v-for`/`ForEach`, `this.state` → `useState`/store, `renderVals()` → derived state + handlers).

The `constructor` holds **real production content** — eight scenes of genuine "Attention Is All You Need" teaching copy (objectives, narration, alternate drafts, visual prompts, canvas chips) plus the seeded producer thread. Reuse it verbatim; it is not lorem.

## Implementing Decode from this bundle

Recreate the designs in whatever environment the target codebase already uses. If none exists, pick a framework and implement there. Fidelity is **high** — every hex, size, and radius in the README is a decided value, not a placeholder. The one abstract area is scene visuals inside the dark canvas; treat that as a slot for future generated HTML/SVG.

Build order (from the spec): design tokens + glass button primitives → crew model → project shell → **derived timing** → stages in order (Understanding → Teaching Plan → Script → Edit → Assets → Export) → Producer drawer → Landing/Dashboard/New Decode/Processing.

## Architectural invariants

These are load-bearing product decisions, not styling preferences. Preserve them in any implementation.

**The crew.** One AI presented as six named specialists — Producer (Understanding), Educator (Teaching Plan), Script Writer (Script), Storyboard Artist (Edit), Motion Designer (Assets), Voice Director (Export). Each has an initial and a color that drive the sidebar mark, header pill, handoff cards, drawer, and scene notes from a single source. Never label the AI "Assistant" or "AI" — always the specific role. All generated copy is first person, past tense for finished work, and always states *why*.

**Nothing is a bare loading state.** No spinners without explanation, no "Generating…"/"Thinking…". Progress is a named checklist with per-step detail lines (see Processing).

**All timing is derived, never stored.** `total = Σ durations`; `starts[i] = Σ durations[0..i-1]`; word timings distribute a scene's duration evenly across tokens. Reordering or retiming recomputes the arc bar, timecodes, transcript, and timeline automatically. The user never manually syncs anything. Get this right before building the timeline.

**Stage gating.** `unlockLevel()`: `approvals.script → 5`, `approvals.plan → 2`, `approvals.understanding → 1`, else `0`. Nav levels: overview 0, plan 1, script 2, edit/assets/export 5. Clicking a locked stage opens the Producer drawer with an explanation — never a tooltip. Approving advances the tab automatically.

**Re-approval asymmetry.** Plan-level edits (reorder, cut, add a beat) reset `plan` *and* `script` approval. Scene-level edits inside Edit (split, merge, duplicate, narration text) reset nothing.

**Script writes, Timeline navigates.** Narration is editable in exactly one place (the Script stage, in place via `contentEditable`). The Edit transcript is read-only navigation. Never two editable copies of the same text.

**Scope reassurance.** Every regeneration states what it did *not* touch ("Nothing else in the timeline changes"). Regeneration swaps between a scene's `narration` and `alt` drafts so the change is visibly real.

**The crew can disagree.** On scenes 3 and 5 the Motion Designer offers two options with a stated preference rather than silently generating. Picking one collapses into a teal confirmation and posts a receipt to the Producer thread.

**No entrance/fade-in animations.** Deliberately removed so nothing is invisible if a timeline never advances. Elements render at settled state. Respect `prefers-reduced-motion`.

**Handoff cards are pinned** (`position:sticky`) — bottom of scroll on Understanding, top on Teaching Plan and Script. Approve must always be reachable.

**Responsive without media queries.** Every fixed-column grid is `repeat(auto-fit, minmax(Xpx, 1fr))`; all display type uses `clamp()`.

## Layout traps recorded in the spec

The README documents specific bugs that were fixed; re-introducing them is a regression:

- Hero floating cards must be anchored **inside** the container (no negative offsets) or they collide with the headline below ~1100px.
- The Edit canvas footer must be a flex sibling, not absolutely positioned, or tall content overlaps the transport controls. Canvas chips are `flex:0 1 auto; min-width:0` with ellipsis.
- The Producer drawer must be **opaque** (`#FCFCFB`) and above the sticky header — translucency made the header's Export button a ghost click target.
- The Understanding "Audience" stat is user free text: step the font size down at 16 and 26 chars, but never line-clamp it.
- Concept pills use `white-space: nowrap` — they must never break mid-label.
- Asset card meta: kind gets `min-width:0` + ellipsis, size gets `flex:none`, or the row wraps out of the card.
