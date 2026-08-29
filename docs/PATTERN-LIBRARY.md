# Pattern Library — the build map to ~100

The library is the product. Each **pattern** is a hand-perfected, narration-timed
scene the Motion Designer *retrieves and edits* (never authors from blank). Every
pattern is a thin **seed** composing the **taste-layer components** — so building a
pattern is fast once its component family exists.

**How to read this:** patterns are grouped by family. Each family shares one or two
components; build the component once, then each pattern is a small seed on top.

- **Status:** ✅ built · ⬜ todo
- **Priority:** **P0** = high-frequency, build first · **P1** = common · **P2** = niche
- **Component:** the taste-layer component it composes (✅ exists · ★ needs building)

**Build order:** build each family's component(s) first (★), then its seeds are
cheap. Do P0 across families before P1. Components are the leverage — one `Chart`
with variants unlocks ~15 chart patterns.

---

## 1. Diagrams — nodes + connections
Components: `Node` ✅ · `Arrow` ✅ · `Network` ✅ · `Tree` ✅ (box / circle) · `Graph` ★

| Pattern | Component | Pri | Status |
|---|---|---|---|
| process-flow — value through labelled stages | Node/Arrow | P0 | ✅ |
| network — layered neurons + weighted edges | Network | P0 | ✅ |
| tree — hierarchy / binary tree / decision tree | Tree | P0 | ✅ |
| flowchart — decision boxes + branches (diamonds) | Node/Arrow | P0 | ⬜ |
| directed-graph — general nodes + edges | Graph | P1 | ✅ |
| state-machine — states + labelled transitions | Graph | P1 | ✅ |
| cycle — circular / feedback loop | Graph | P1 | ✅ |
| hierarchy / org-chart — top-down tree | Tree ★ | P1 | ⬜ |
| pipeline — linear stages carrying data | Node/Arrow | P1 | ⬜ |
| mind-map — central node + branches | Tree ★ | P2 | ⬜ |
| dependency-graph — DAG | Graph ★ | P2 | ⬜ |
| venn — overlapping sets | Venn ★ | P1 | ⬜ |
| nested-boxes — containment (system-in-system) | Node | P1 | ⬜ |
| swimlane — process across actors | Node/Arrow | P2 | ⬜ |
| sankey — flow with proportional widths | Sankey ★ | P2 | ⬜ |

## 2. Charts — quantitative data
Components: `Plot` ✅ (curve) · `Chart` ✅ (bar / line / area / scatter)

| Pattern | Component | Pri | Status |
|---|---|---|---|
| plot-curve — function / loss curve + marker | Plot | P0 | ✅ |
| line-chart — time series | Chart | P0 | ✅ |
| bar-chart — categorical bars | Chart | P0 | ✅ |
| distribution-curve — bell / density | Chart | P0 | ✅ |
| scatter-plot — points (+ embedding space) | Chart | P0 | ✅ |
| histogram — binned distribution | Chart ★ | P1 | ⬜ |
| grouped-bar / stacked-bar — multi-series | Chart ★ | P1 | ⬜ |
| area-chart / filled-region (integral) | Chart ★ | P1 | ⬜ |
| pie / donut — parts of a whole | Chart ★ | P1 | ⬜ |
| multi-line — several series | Chart ★ | P1 | ⬜ |
| step / cumulative chart | Chart ★ | P2 | ⬜ |
| box-plot | Chart ★ | P2 | ⬜ |
| gauge / progress meter | Meter ★ | P2 | ⬜ |
| bar-race — animated ranking | Chart ★ | P2 | ⬜ |
| decision-boundary — plot + shaded regions | Chart ★ | P2 | ⬜ |

## 3. Structures — grids, tables, data structures
Components: `Matrix` ✅ · `Table` ✅ · `Tree` ✅ · `Cells` ★ (array/stack/queue)

| Pattern | Component | Pri | Status |
|---|---|---|---|
| matrix-grid — value cells / heatmap | Matrix | P0 | ✅ |
| comparison — side-by-side table | Table | P0 | ✅ |
| table — plain data table | Table | P1 | ⬜ |
| array — indexed cells (algorithms) | Cells | P0 | ✅ |
| stack — LIFO | Cells | P1 | ✅ |
| queue — FIFO | Cells | P1 | ✅ |
| linked-list — nodes + pointers | Node/Arrow | P1 | ⬜ |
| grid / lattice — 2D cells | Cells ★ | P1 | ⬜ |
| binary-tree / heap — data tree | Tree | P1 | ✅ |
| hash-map — buckets | Cells ★ | P2 | ⬜ |
| confusion-matrix | Matrix | P2 | ⬜ |

## 4. Text — the beat is words
Components: `Statement` ✅ · `Stat` ✅ · `Term` ★ · `Code` ★

| Pattern | Component | Pri | Status |
|---|---|---|---|
| statement — big line, word reveal (5 styles) | Statement | P0 | ✅ |
| stat — count-up figure | Stat | P0 | ✅ |
| term-definition — big word + definition beneath | Term | P0 | ✅ |
| kicker-headline — eyebrow + headline | Statement | P1 | ⬜ |
| equation — math formula reveal | Equation | P0 | ✅ |
| code-block — syntax + line highlight | Code | P0 | ✅ |
| quote — attributed | Statement | P1 | ⬜ |
| list-reveal — staged points (not bullet slop) | Statement | P1 | ⬜ |
| fill-in-blank — reveal the answer | Statement | P2 | ⬜ |
| big-word — one emphasised word | Statement | P2 | ⬜ |

## 5. Processes & mechanisms — motion carries the idea
Components: mostly compose existing + `Timeline` ★

| Pattern | Component | Pri | Status |
|---|---|---|---|
| timeline — events on a line | Timeline | P0 | ✅ |
| steps — numbered sequence in motion | Node | P0 | ⬜ |
| before-after — split / transform | compose | P0 | ⬜ |
| transformation — A morphs into B | compose | P1 | ⬜ |
| sort-visualization — bars sorting | Chart ★ | P1 | ⬜ |
| search-visualization — window contracting | Cells ★ | P1 | ⬜ |
| traversal — walking a graph/tree | Graph/Tree ★ | P1 | ⬜ |
| accumulation — things pile up | compose | P2 | ⬜ |
| progress-build — assembling a thing | compose | P2 | ⬜ |
| zoom-in — reveal inner structure | compose | P2 | ⬜ |

## 6. Spatial & math
Components: `NumberLine` ★ · `Axes2D` ★ (+ Plot) · `Geometry` ★ · `Three` (3D)

| Pattern | Component | Pri | Status |
|---|---|---|---|
| number-line — points/intervals on a line | NumberLine | P0 | ✅ |
| coordinate-plane — 2D axes + points/vectors | Axes2D | P0 | ✅ |
| vector — arrows in space | Axes2D | P1 | ✅ |
| geometry — shapes, angles, proofs | Geometry ★ | P1 | ⬜ |
| grid-transform — matrix transforming space | Axes2D ★ | P1 | ⬜ |
| unit-circle — trig | Geometry ★ | P2 | ⬜ |
| gradient-field — vectors on a grid | Axes2D ★ | P2 | ⬜ |
| map — geographic regions/points | Map ★ | P2 | ⬜ |
| 3d-axes — 3D coordinate space | Three | P2 | ⬜ |

## 7. Relations & emphasis
Components: `Spectrum` ★ · `Quadrant` ★ · annotation via existing

| Pattern | Component | Pri | Status |
|---|---|---|---|
| spectrum / scale — a value on a range | Spectrum | P0 | ✅ |
| quadrant — 2×2 (two axes) | Quadrant ★ | P1 | ⬜ |
| funnel — narrowing stages | compose | P1 | ⬜ |
| balance — weighing two things | compose | P2 | ⬜ |
| mapping — A→B correspondence (two cols + arrows) | Node/Arrow | P1 | ⬜ |
| proportion — part of a whole | Chart ★ | P2 | ⬜ |
| pyramid / levels — layered hierarchy | compose | P2 | ⬜ |
| highlight / spotlight — emphasise one element | overlay | P1 | ⬜ |
| callout — arrow + label pointing at a thing | Arrow/Label | P1 | ⬜ |

## 8. Domain — ML / CS (high value for this audience)

| Pattern | Component | Pri | Status |
|---|---|---|---|
| attention-matrix | Matrix | P0 | ✅ (matrix) |
| tokenization — text split into tokens | Cells ★ | P1 | ⬜ |
| embedding-space — points in 2D | Chart ★ | P1 | ⬜ |
| convolution — window sliding over a grid | Cells ★ | P2 | ⬜ |
| tree-search / minimax — game tree | Tree ★ | P2 | ⬜ |
| probability — dice / coins / urn | compose | P2 | ⬜ |

---

## Component build queue (the leverage)
Building these ★ components unlocks whole families:

1. **`Chart`** (generalise `Plot`): line, bar, scatter, area, pie, histogram, distribution — **~15 patterns**. Highest leverage.
2. **`Tree`** + **`Graph`**: tree, hierarchy, decision, state-machine, cycle, traversal — **~10 patterns**.
3. **`Cells`**: array, stack, queue, grid, tokenization, search-viz — **~8 patterns**.
4. **`Term`**, **`Code`**, **`Equation`**: the P0 text gaps — **~4 patterns**.
5. **`NumberLine`**, **`Axes2D`**: number-line, coordinate-plane, vectors — **~5 patterns**.
6. **`Timeline`**, **`Spectrum`**, **`Quadrant`**, **`Venn`**: one pattern each, P0/P1.

## Tally
- **Built:** 24 across 15 components. Sprint 1 complete (Chart · Tree · Cells · Term · Code · Equation · NumberLine · Axes2D · Timeline · Spectrum).
- **Mapped:** ~90 more across 8 families
- **P0 (build first):** ~20 patterns, gated on ~5 new components

## Recommended first sprint (all P0, ~component-family order)
1. `Chart` component → line, bar, scatter, distribution (4)
2. `Tree` component → tree, flowchart (2)
3. `Term` + `Code` + `Equation` → 3 text patterns
4. `Cells` → array (1)
5. `NumberLine` + `Axes2D` → number-line, coordinate-plane (2)
6. `Timeline`, `Spectrum` → 2
7. steps, before-after → 2 (compose existing)

→ ~16 new patterns from ~7 new components, taking the library from 7 → ~23 and
covering the most common educational shapes.
