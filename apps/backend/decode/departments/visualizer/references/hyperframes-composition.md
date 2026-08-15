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
