# CHOREOGRAPHY-API.md — Layer 2: the model choreographs, the runtime animates

Status: **proposal + proof-of-concept** (one DNS scene hand-ported; see the
notebook demo linked from the PR/chat). Builds on the Layer-1 relational
primitives (Stack/Row/Anchor/Connector/Label) the same way Manim's animation
verbs build on its layout helpers.

## The diagnosis this answers

Rendered frames of a real build showed the failure class in pixels: a scene's
midpoint was a black stage; another's last moment was one dim label in a void.
The model authors raw `interpolate(frame, …)` opacity math — per-element
keyframes — and with that freedom it writes *vanishing vignettes*: element in,
element out, nothing accumulates. Every prompt rule we add ("build, never
erase", "fill the stage") polices a freedom the model shouldn't have.

Manim's insight, stolen whole: **the author never touches interpolation.**

1. **Objects persist by construction.** A scene is a scene graph; `Create(x)`
   adds x and it stays until deliberately replaced. Empty frames are
   unrepresentable.
2. **Animation is a closed vocabulary of verbs** (`Create`, `Write`,
   `Transform`, `Indicate`…). The library owns easing, stagger, and paths —
   uniformly excellent because they're written once.
3. **`Transform` carries identity** — an object *becomes* the next idea, so the
   viewer tracks one concept through change. That continuity is the 3b1b feel.

## The contract

A scene is **a cast plus a script** — declarative data, zero animation math:

```ts
interface ChoreographedScene {
  cast: Record<ElementId, Element>;   // built from Layer-1 primitives
  script: Step[];                     // played in order, timed by narration
}

type Verb =
  | { appear: ElementId; from?: "left" | "right" | "top" | "bottom" | "grow" }
  | { indicate: ElementId }                    // pulse attention, then settle
  | { dim: ElementId | ElementId[] }           // recede, NEVER disappear
  | { focus: ElementId }                       // dim everything else
  | { connect: [ElementId, ElementId]; label?: string }  // draw the relation
  | { transform: [ElementId, ElementId] }      // a BECOMES b, identity carried
  | { relabel: ElementId; text: string };      // text morph in place

interface Step {
  anchor: string;   // the narration words this lands on (semantic Anchor,
                    // resolved to seconds by decode/timing.py — ADR-005)
  play: Verb[];     // verbs in one step run staggered together
}
```

Load-bearing properties, enforced by the API's shape rather than by prompts:

- **There is no `disappear`/`fadeOut` verb.** An element leaves the stage only
  via `transform` (it became something) — so the scene monotonically assembles
  and the final frame contains the whole diagram. "Build, never erase" stops
  being a rule and becomes the type system.
- **The runtime owns all motion**: one easing family, entrance offsets, stagger
  spacing, indicate pulses, connector draw-on. A scene cannot have bad easing
  because no scene contains easing.
- **Narration is the clock.** Steps anchor to words, not frames — retiming
  narration retimes the film with no sync step, exactly as today.
- **Layout stays Layer-1.** The cast is Stack/Row/Anchor/Connector/Label
  compositions; the choreography never positions anything.

## What the model emits (renderer prompt, after migration)

Structured output only: `cast` (as today's primitive JSX, unchanged skills) +
`script` (JSON verbs anchored to narration snippets). Validation becomes
trivial and total: every ElementId referenced exists, every anchor matches
narration text, at least one verb per narration segment, `transform` pairs are
type-compatible. No regex over animation math — there is none.

## Migration plan (dial-in-each-part-first)

1. **Proof (done):** verb runtime prototyped standalone; one real DNS beat
   ("names vs destinations") hand-ported — same cast, same narration, no empty
   frames possible. Reviewed on the notebook demo.
2. **Runtime in `animation-api.tsx`:** `<Choreography cast script>` component
   implementing the verbs over Remotion's frame clock, driven by the beat's
   `words` timings where present, proportional fallback otherwise.
3. **Renderer emits choreography** for new scenes behind a setting
   (`DECODE_CHOREOGRAPHY=auto`); legacy raw-React scenes keep playing — same
   dual-substrate pattern as the HyperFrames migration.
4. **Retire the policing:** the scale-floor/empty-frame/transform-excursion
   prompt rules and their validators shrink to cast-level checks; the vision
   gate stays (it judges teaching quality, which no type system can).

## Non-goals

- Adopting Manim itself: Python, offline render, no interactive preview —
  wrong substrate for the player and the HyperFrames direction. We take the
  model, not the engine.
- Free-form SVG diagrams stay allowed inside the cast (Layer-1 rules apply);
  choreography governs *when things move*, not what a diagram contains.
