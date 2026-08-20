# Measure-first auto-repair — spike (#5 → #4)

Proves: measure the **real** rendered geometry of a generated scene, then a
bounded deterministic pass enforces the frame guarantees — no model tokens, run
against the existing Run 5 output.

## How it ran

1. **Measure (#5).** The Run 5 player renders each scene in a real DOM. Playwright
   reads `getBoundingClientRect()` for every `data-decode-box`, un-scales by the
   preview transform, and yields ground-truth **1920×1080 composition
   coordinates** (`measured-beat01.json`, 35 boxes). No estimation.
2. **Repair (#4).** `repair.mjs`: content bbox → uniform **scale-to-fit** the
   SafeArea about centre → **translate** into the margins. Bounded and
   idempotent; scale-to-fit can only shrink, so it can never *introduce* an
   overflow — correctness-by-construction.

## Result (`node run.mjs`)

| scene | before | repair | after |
|---|---|---|---|
| Run 5 beat-01 | **5 boxes overflow** safe area, 0 overlaps | scale 0.982× | **0 overflow** |
| synthetic stress | 1 overflow, 1 overlap | scale 0.96× + translate −240 | **0 overflow**, overlap still flagged |

beat-01 is real: its card row spanned x 80→1840, but the 96px safe margin ends
at 1824 — a genuine 16px-per-side overflow the model shipped and nobody caught.
The pass fixes it deterministically.

## What the spike taught us (the useful part)

1. **Scale-to-fit is a guaranteed fix for overflow.** Zero-overflow after, every
   time, on real and synthetic input. This half is production-ready.
2. **Overflow and MIN_GAP fight.** Uniform down-scale shrinks *absolute* gaps
   too: beat-01's exact-48px inter-row gaps became 47px after the 0.982× scale
   and tripped the `<48` check. So the two guarantees are **not both satisfiable
   by scaling alone** — gaps need *redistribution* (push rows apart within the
   freed space), not more scaling (which makes them worse). Repair order must be
   overflow-scale → gap-redistribute, re-checked.
3. **Collision resolve is the real remaining work** and is deliberately NOT
   claimed here. The stress overlap is *detected* and *reported*, never silently
   "fixed". The safe version is per-row 1-D redistribution (bounded), not a
   free-running 2-D solver (cascades).

## Verdict / next step

Measurement is solid and reusable. Scale-to-fit is ready to wire as a
post-generation pass. Before that lands, add the bounded **row-redistribute**
step (fixes both the gap-shrink side-effect and real overlaps), then run this
same harness to confirm zero-overflow *and* zero-collision on all 8 Run 5 scenes.
Wire point: a measure pass on the still-render bundle → `repair()` → stamp
corrected geometry, behind the existing vision gate.

Files: `repair.mjs` (algorithm + `demo()` self-check), `run.mjs` (runner),
`measured-*.json` (captured real geometry).
