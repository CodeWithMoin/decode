# Measure-first auto-repair — spike (#5 → #4)

Goal: measure the **real** rendered geometry of the Run 5 scenes, then a bounded
deterministic pass enforces the frame guarantees — no model tokens.

## Measurement (#5) — solid, all 8 scenes

The Run 5 player renders each scene in a real DOM. An injected recorder plays the
whole 3:01 cut and, per scene (keyed by transport time), keeps the most-assembled
frame; `getBoundingClientRect()` un-scaled by the preview transform yields
ground-truth **1920×1080 composition coordinates** (`measured-all8.json`, 8
scenes, 28–88 boxes each). No estimation.

## The result that matters: `fit()` guarantees zero overflow

`fit()` applies ONE rigid transform to the whole scene root — scale to fit the
safe area, then translate inside the margins. Every box moves by the same
transform, so all internal structure and spacing is preserved exactly; it can
only shrink the footprint, so it can never create a new violation.

| | overflow before → after | note |
|---|---|---|
| beat-01…08 | 5,7,5,10,10,5,2,6 → **all 0** | scale 0.97–1.0, small translate |

**Safe-area overflow: solved. 0 across all 8, guaranteed, structure-free.**
This is exactly what a `SafeArea` wrapper would apply as one CSS `transform`
after measuring. Every one of the 8 scenes shipped some overflow (2–10 boxes past
the 96px margin); `fit()` removes it deterministically without touching the
composition.

## The finding: you cannot repair collisions by moving flattened boxes

The row-redistribute pass (`repair()`, scale + per-axis gap redistribution +
clamp) was built and tested against all 8. It works on clean grid scenes
(beat-04, beat-05 → 0/0) but **regresses 6/8** — overflow *explodes* (e.g.
beat-07 2 → 46) on dense/nested scenes.

Root cause, and it's the real lesson: `getBoundingClientRect()` **flattens away
the parent/child structure.** Moving a "card" as a flat box does not move its
label, and geometry-inferred "units" mis-cluster once layouts nest. The only
transform that stays correct on flattened geometry is one applied to the *whole
tree at once* — which is exactly `fit()`.

The residual "collisions" `fit()` leaves (48 total, in beats 01/02/07/08) are
mostly **sub-48px proximity** between cards in tight compositions (measured gaps
14–31px), plus a few nested cards overflowing their parent by ~7px — not gross
overlaps. The flat metric also can't tell intended-tight from problematic.

## Verdict

- **Overflow guarantee → ship `fit()`.** Wire it as the `SafeArea` operation: a
  measure pass on the still-render bundle → compute `{scale, tx, ty}` →
  `transform` the scene root. Structure-free, cascade-free, zero overflow.
- **Collision/gap guarantee → NOT a geometry repair.** Moving flat boxes is a
  dead end (proven, 6/8 regressed). It belongs to the layout *tree* — the Layer-1
  primitives already guarantee non-overlap when the model composes with
  Stack/Row/Grid; the residual tight/overlapping cases come from scenes that
  didn't, so the fix is composition (prompt + primitives) + the vision gate, not
  a post-hoc nudge.
- **Measurement is the reusable asset** — it's the signal for both the `fit()`
  transform and for feeding real overflow/proximity facts back to authoring.

Files: `repair.mjs` (`fit()` = the safe transform + `demo()` self-check;
`repair()` = the experimental redistribute, kept to document why it fails),
`run-all.mjs` (all-8 runner), `run.mjs` (beat-01 + synthetic),
`measured-all8.json` / `measured-beat01.json` (captured real geometry).
