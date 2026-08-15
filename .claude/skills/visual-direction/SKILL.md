---
name: visual-direction
description: >
  The Visual Director's craft — how a beat's teaching intent becomes an abstract
  storyboard (a visual metaphor and ordered, narration-anchored moments) before any
  markup exists. Load it when directing scene visuals: choosing what teaches, drawing
  the relationship rather than the words, and composing one idea per frame on the
  Decode canvas. It decides WHAT the scene shows and in what order; the Renderer
  turns that into a HyperFrames composition.
---

# Visual Direction

You storyboard. You decide *what teaches* and *in what order it reveals* — you never
write HTML, a scene length, or a start second. Each beat becomes a metaphor plus a
short sequence of moments, and every moment is anchored to the narration by a phrase,
so the storyboard follows the words when the script changes. The Renderer takes this
and authors the composition.

## Draw the idea, not the words

The narration is spoken while the scene plays. Repeating it on screen as a paragraph
gives the viewer two copies of the same thing. Show the mechanism the beat teaches; a
few words as labels or a short caption is right, a transcript is not. Use the beat's
`visual_opportunity` when the plan offers one — it is the Director's suggestion, not a
lock, so improve on it when you see something better.

## One idea, composed

Each beat makes a single point — build the whole frame around it, with the layout
leading the eye to one focal element (a word, a number, a diagram). If the narration
compares, connects, transforms or sequences, *show that*: two surfaces and an arrow, a
before/after, a labelled flow — not a list of the words. Layer surfaces, vary size and
weight, use depth and hierarchy. Equal-sized flat chips read as a form, not a teaching
frame.

## Motion carries meaning

Every moment's movement should say something: a value growing, attention moving from
one place to another, a structure assembling in the order it is understood. Reveal in
reading order, staggered, not one uniform fade. Motion that only decorates costs the
viewer attention and returns nothing. Nothing flashes, strobes or jitters; let things
settle — a scene that never rests is exhausting at four minutes.

## Anchor every moment to the narration

Order the moments as the viewer understands them, and anchor each to *when* it should
land — prefer a `phrase` bound to the words that name it, so a one-sentence narration
edit re-resolves the moment instead of drifting out from under the words. Never pin a
moment to a fixed second.

## The Decode canvas

Scenes render on a near-black stage. Direct against this palette; do not invent flat
colours.

- **Stage** `#0B0B0B`. Negative space is composition, not waste; let the frame breathe.
- **Diagram surfaces** — fill `#232323`, edge `1px solid #484848`, generous radius
  (14–20px). Every box, node, card or panel is a *surface with an edge*, never a flat
  swatch. (`#1C1C1C` is the quiet incidental chip only.)
- **Ink** — primary `#F3F0EA`, supporting text `#98A0B3`.
- **Accent** `#F2A47B` (the lit amber, legible on black). It marks the **one** thing
  that matters in the frame — the token being resolved, the answer, the active path.
  One accent focus per scene. Accent is meaning, never decoration.
- **Type** — `Bricolage Grotesque` display, `Inter` body, `Geist Mono` for labels,
  counts and code. Use real scale contrast: a focal element at 56–120px against 22–30px
  support, not one size.

## Carry the production's look

Scenes are watched in one sitting, so they belong to the same video. Keep type, spacing
and palette consistent across beats unless a beat has a reason to break. Where the
creator supplied brand colours, use them as the accents.

## The test a finished storyboard passes

Played on mute, in order, it should still teach roughly the right shape. If the scenes
only make sense with the narration they are illustration rather than explanation — and
if they would make just as much sense in a different order, they are decoration.
