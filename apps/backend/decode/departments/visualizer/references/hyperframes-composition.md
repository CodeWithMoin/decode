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

A title with a bulleted list fading in is the weakest possible scene. Aim higher:

- **One idea, composed.** Build the whole frame around a single point, with layout
  (CSS grid/flex) leading the eye to one focal element — a word, a number, a diagram.
- **Draw the relationship.** If the narration compares, connects, transforms or
  sequences, *show it*: two surfaces and a connector, a before/after, a labelled
  flow. Not the sentence as text.
- **Depth and hierarchy.** Layer surfaces, vary size and weight, use the `#484848`
  edge to separate. Equal-sized flat chips read as a form, not a teaching frame.
- **Draw the mechanism, not the narration.** The words are spoken *while* the scene
  plays — repeating them on screen gives the viewer two copies to choose between.
  A few words as labels or one short caption is right; a transcript is not.

### Choreograph on the timeline

- **Reveal in reading order**, staggered per element, each on its beat's resolved
  start (`at("<beat>").start`) — not one uniform fade. Motion should explain the
  sequence, not merely announce arrival.
- **Motion carries meaning or it does not belong**: a value growing, attention
  moving from one place to another, a structure assembling as it is understood.
- Ease everything (`power4.out`-style), let it **settle** — a scene that never
  rests is exhausting. Nothing flashes, strobes or jitters.

### The shape of a composed scene (technique, not a template)

```html
<div id="bg"></div>                         <!-- #0B0B0B stage fill on a child -->
<div id="stage" class="clip" data-start="0" data-duration="{{SCENE_DURATION}}" data-track-index="1"
     style="position:absolute;inset:0;display:grid;place-items:center;gap:48px;grid-auto-flow:column">
  <div id="q" style="background:#232323;border:1px solid #484848;border-radius:16px;padding:28px 36px;
       font:600 96px ui-sans-serif;color:#F3F0EA">query</div>
  <div id="k" style="background:#232323;border:1px solid #484848;border-radius:16px;padding:28px 36px;
       font:600 96px ui-sans-serif;color:#F2A47B">key</div>   <!-- the one accent -->
</div>
<!-- decode:timing -->
<script>
  window.__timelines = window.__timelines || {};
  const t = window.__decodeTiming || [];
  const at = (n) => t.find((x) => x.beat === n) || { start: 0, duration: 0.6 };
  const tl = gsap.timeline({ paused: true });
  const q = at("query"), k = at("key");
  tl.fromTo("#q", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: q.duration, ease: "power4.out" }, q.start);
  tl.fromTo("#k", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: k.duration, ease: "power4.out" }, k.start);
  window.__timelines["main"] = tl;
</script>
```

Read the palette, hierarchy and choreography above off this shape — do not copy
it. Build the composition the *specific* beat needs.
