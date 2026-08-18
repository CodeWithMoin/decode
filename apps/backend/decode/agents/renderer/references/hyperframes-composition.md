# Authoring a HyperFrames composition

You output a **HyperFrames composition** — an HTML document whose DOM declares
timing with `data-*` attributes and whose animation is a single seekable GSAP
timeline. HyperFrames renders it deterministically to video. You author *what*
happens and *how it moves*; Decode owns *when* (it resolves your beats against
the narration) and *how long* (the scene length comes from the narration, not
from you). Never write a second.

This is the contract, condensed. Follow it exactly — a composition that violates
it fails the linter and is rejected.

## The document shape

A standalone composition (top-level `index.html`), root directly in `<body>` —
**no `<template>` wrapper**:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #stage-bg { position: absolute; inset: 0; background: #0b0b0b; }
      /* Elements you animate set NO CSS opacity/transform — the tween owns them. */
    </style>
  </head>
  <body>
    <div id="root"
         data-composition-id="main"
         data-start="0"
         data-duration="{{SCENE_DURATION}}"
         data-width="1920"
         data-height="1080">
      <div id="stage-bg"></div>
      <!-- your scene elements, each a .clip -->
    </div>

    <!-- decode:timing -->
    <script>
      window.__timelines = window.__timelines || {};
      const timing = window.__decodeTiming || [];
      const at = (name) => timing.find((t) => t.beat === name) || { start: 0, duration: 0.6 };
      const tl = gsap.timeline({ paused: true });
      /* one fromTo per beat, placed at at("<beat>").start */
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
```

## Non-negotiable rules (the linter enforces these)

- **Root** carries `data-composition-id`, `data-start="0"`, `data-duration`,
  `data-width`, `data-height`. Omitting `data-start="0"` fails lint.
- **Exactly one** `gsap.timeline({ paused: true })`, built synchronously at load,
  registered at `window.__timelines["main"]` — the key equals the root's
  `data-composition-id`.
- Every animated element is a **`class="clip"`** with `data-start`,
  `data-duration` (seconds) and `data-track-index`.
- **Set the `from` state inside the tween** with `gsap.fromTo(el, {opacity:0}, {opacity:1})`.
  Never pair a CSS initial `transform`/`opacity` with a GSAP tween on the same
  property (`gsap_css_transform_conflict`).
- **Determinism:** no `Date.now()`, no unseeded `Math.random()`, no network at
  render time, no `repeat: -1` (use a finite count). Animate only visual
  properties (transform, opacity, color, filter…); never tween `display` or raw
  `visibility`.
- A full-screen fill goes on a **child** (`position:absolute; inset:0`), never on
  `#root` — the compositor can drop the root's own background.
- The root needs a **sized box** and every `id` must be unique.

## The Decode contract — you never write a time

- Put `data-duration="{{SCENE_DURATION}}"` on the root **literally**. Decode
  stamps the measured narration length in; you must not compute it.
- Leave the `<!-- decode:timing -->` marker in place, just above your `<script>`.
  Decode replaces it with `window.__decodeTiming`, an array of
  `{ beat, start, duration }` resolved from the narration.
- Your timeline reads those by beat name (`at("reveal").start`) and places each
  tween there. Do **not** hardcode a start second — a one-sentence narration edit
  re-resolves the beats, and a hardcoded time would drift.

## Declaring beats

Alongside the HTML, return `beats: [{ name, anchor, duration_s }]` — one per
animated moment. `name` matches the beat you read in the timeline. `anchor`
declares *when* it fires, never a second:

- `{"kind": "phrase", "phrase": "attention weight", "align": "start"}` — fire when
  the narration says these words (the resilient kind; follows script edits).
- `{"kind": "progress", "at": 0.0}` — a fraction 0..1 of the scene (an ambient
  fade with no spoken hook). `0.0` is scene start.
- `{"kind": "time", "at": 2.5}` — an absolute second. The escape hatch; stops
  following the narration. Avoid unless a human pinned it.

`duration_s` is how long *that move* takes (e.g. `0.6`) — your choice, distinct
from the scene length. Prefer `phrase` anchors so motion lands on the words that
name it.

## Composing a scene that teaches

A valid composition is the floor, not the goal. This is how a scene earns its
frame — the design intent in the assignment turned into concrete HTML/CSS/GSAP.

### The stage and palette — use these exact values

Everything sits on a near-black stage. Never invent flat colours.

- **Stage** `#0B0B0B`, on a full-bleed child (`position:absolute; inset:0`), never
  on `#root`. Negative space is composition; let the frame breathe.
- **Diagram surfaces** — every box, node, card or panel is a *surface with an
  edge*: `background:#232323; border:1px solid #484848; border-radius:16px` (14–20px).
  Never a flat swatch. `#1C1C1C` is the quiet incidental chip only.
- **Ink** — primary `#F3F0EA`, support `#98A0B3`.
- **Accent** `#F2A47B` — the lit amber. It marks the **one** thing that matters in
  the frame (the token being resolved, the answer, the active path). One accent
  focus per scene. Accent is meaning, never decoration.
- **Type** — a heavy sans system stack (`font-family: ui-sans-serif, system-ui,
  -apple-system, "Segoe UI", Roboto, sans-serif`); do **not** add a Google Fonts
  `<link>` (the linter warns and it adds render latency). Earn identity with
  weight (600–800) and real scale contrast: a focal element at **56–120px**
  against **22–30px** support, never one size.

### Make it a picture, not a slide

A title with a bulleted list fading in is the weakest possible scene. A row of
text cards is the *second* weakest — it looks composed but teaches nothing the
narration doesn't already say. Aim higher:

- **Draw the objects — do not name them.** This is the rule that matters most, and
  the one most often broken. The things the beat is about must be *drawn as shapes* —
  the actual structure rendered in geometry — not represented by their names inside a
  box. A bit array is **a row of drawn cells** (small sized boxes in a grid), not a
  card reading "bit row". A hash is **a drawn arrow** from the item to the cell it
  lands on, not the word "hash". A set membership check is cells **flipping to the
  accent** as they are read, not a card reading "checking". If you catch yourself
  putting a noun in a box, draw the noun instead. Text on the frame is for **short
  labels riding on the shapes** (≤3 words) and at most one caption — never the
  mechanism itself.
- **One idea, composed.** Build the whole frame around a single point, with layout
  (CSS grid/flex, or an inline `<svg>` for cells/arrows/paths) leading the eye to one
  focal element — a number, a lit cell, a node.
- **Draw the relationship.** If the narration compares, connects, transforms or
  sequences, *show it*: two shapes and a connector, a before/after, arrows along a
  flow. The connector is a drawn line or `<svg>` path, not the word "then".
- **Depth and hierarchy.** Layer surfaces, vary size and weight, use the `#484848`
  edge to separate. Equal-sized flat chips read as a form, not a teaching frame.
- **Draw the mechanism, not the narration.** The words are spoken *while* the scene
  plays — repeating them on screen gives the viewer two copies to choose between.
  A few words as labels or one short caption is right; a transcript is not.

Inline `<svg>` is first-class here — use it for cells, grids, arrows, connectors,
nodes and paths. Sized `<div>`s arranged on a grid are equally good for a row or
matrix of cells. Reach for whichever draws the *actual object* most directly.

### Choreograph on the timeline

- **Reveal in reading order**, staggered per element, each on its beat's resolved
  start (`at("<beat>").start`) — not one uniform fade. Motion should explain the
  sequence, not merely announce arrival.
- **Motion carries meaning or it does not belong**: a value growing, attention
  moving from one place to another, a structure assembling as it is understood.
- Ease everything (`power4.out`-style), let it **settle** — a scene that never
  rests is exhausting. Nothing flashes, strobes or jitters.

### The shape of a composed scene (technique, not a template)

Note what this *draws*: an item, three hash arrows, and a row of bit cells — the
three the item lands on flip to the accent as it is inserted. The objects are
geometry, not words in boxes; the only text is one-word labels riding on shapes.

```html
<div id="bg"></div>                         <!-- #0B0B0B stage fill on a child -->
<style>
  .cell{width:76px;height:76px;border-radius:12px;background:#232323;border:1px solid #484848;
        display:grid;place-items:center;font:700 30px ui-sans-serif;color:#98A0B3}
</style>
<div id="stage" class="clip" data-start="0" data-duration="{{SCENE_DURATION}}" data-track-index="1"
     style="position:absolute;inset:0;display:grid;place-items:center;gap:40px">
  <div id="item" style="background:#232323;border:1px solid #484848;border-radius:14px;padding:14px 22px;
       font:700 32px ui-sans-serif;color:#F3F0EA">x</div>            <!-- the item, drawn as a node -->
  <svg id="wires" width="560" height="88" viewBox="0 0 560 88" fill="none"> <!-- hashes = drawn arrows -->
    <path d="M280 2 C280 48 96 44 96 86"  stroke="#F2A47B" stroke-width="3"/>
    <path d="M280 2 C280 48 280 44 280 86" stroke="#F2A47B" stroke-width="3"/>
    <path d="M280 2 C280 48 464 44 464 86" stroke="#F2A47B" stroke-width="3"/>
  </svg>
  <div id="bits" style="display:grid;grid-auto-flow:column;gap:14px">  <!-- the array = a row of cells -->
    <i class="cell">0</i><i class="cell" id="b1">0</i><i class="cell">0</i>
    <i class="cell" id="b2">0</i><i class="cell">0</i><i class="cell" id="b3">0</i><i class="cell">0</i>
  </div>
</div>
<!-- decode:timing -->
<script>
  window.__timelines = window.__timelines || {};
  const t = window.__decodeTiming || [];
  const at = (n) => t.find((x) => x.beat === n) || { start: 0, duration: 0.6 };
  const tl = gsap.timeline({ paused: true });
  const arrive = at("item"), set = at("set");
  // the item and the empty row arrive first, in reading order
  tl.fromTo("#item", { autoAlpha: 0, y: -20 }, { autoAlpha: 1, y: 0, duration: arrive.duration, ease: "power4.out" }, arrive.start);
  tl.fromTo("#bits > *", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.05, ease: "power4.out" }, arrive.start);
  // then the hashes fire and the three cells they land on flip to the accent — the mechanism, drawn
  tl.fromTo("#wires path", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.08, ease: "power2.out" }, set.start);
  tl.to("#b1, #b2, #b3", { backgroundColor: "#F2A47B", borderColor: "#F2A47B", color: "#0B0B0B", duration: 0.4, stagger: 0.1, ease: "power2.out" }, set.start + 0.15);
  window.__timelines["main"] = tl;
</script>
```

Read the palette, hierarchy and choreography above off this shape — do not copy
it, and do not fall back to labelled boxes when the beat is not about an array.
Build the composition the *specific* beat needs: draw *its* objects.
