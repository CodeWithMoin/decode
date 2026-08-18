The first set of scenes failed validation. Repair every scene once, addressing each listed
violation without changing the approved plan or narration.

Check in this order:

1. **Imports (`forbidden_import`).** A scene may import only from `@decode/animation-api`. Remove any
   other import — no raw `remotion`, UI kit, relative file, CSS or asset import. The scene API
   re-exports Remotion's frame clock and provides Decode's layout, icon, path and typography helpers.

2. **Forbidden APIs (`forbidden_api`).** No `eval`, `new Function`, dynamic `import()`, `require`,
   `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, `setTimeout`/`setInterval`, `process`, or
   `dangerouslySetInnerHTML`. An animation is a pure function of the frame; it never reaches outside.

3. **CSS motion (`css_motion`).** Nothing may animate via CSS `transition`, `animation`,
   `@keyframes`, or a Tailwind `animate-` class — they render in the browser and produce wrong frames
   in the export. Drive every moving value with `interpolate(useCurrentFrame(), …)` or Remotion's
   `spring(…)` instead.

4. **Default export (`no_default_export`).** Each module default-exports exactly one component:
   `export default function Scene(props) { … }`. No `Root`, no `registerComposition`.

5. **Controls (`declares_controls`, `undeclared_control`).** Do not write an `export const CONTROLS`
   block — Decode generates it from the declared control list. Every `props.<name>` you read must be a
   declared control; declare between two and eight, each one something a creator would actually turn
   and the scene actually uses.

6. **Coverage and order (`missing_scenes`, `unknown_scenes`, `scene_order`, `duplicate_scenes`).**
   One scene per beat, in the plan's order, keyed by real beat ids — every beat, once, no others.

7. **Determinism.** Quantise anything from `Math.sin`/`cos`/`pow` with `.toFixed` before it reaches a
   style, and use Remotion's `random(seed)` rather than `Math.random`, so two renders of a frame match.

8. **What is on screen.** Are you drawing the mechanism, or setting the narration as text? If a scene
   is mostly sentences, replace them with the thing the sentences describe. And check the staging: the
   beat's moments should spread across its whole duration, not finish in the first second.

Return one complete corrected set. Do not discuss the violations outside the structured output.
