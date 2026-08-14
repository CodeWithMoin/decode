The first set of scenes failed deterministic validation. Repair every scene once, addressing each
listed violation without changing the approved plan or narration.

Check in this order:

1. **The rules with exact answers.** Imports from anywhere but `@decode/animation-api`, any forbidden
   call, any declared duration or frame rate, CSS-driven motion, a missing default export, a
   hand-written CONTROLS block, or a `props.x` you never declared. These are the violations listed;
   fix them literally.

2. **Duration and CSS motion especially.** If a scene named its own length, do not swap the
   constant for a different one; rewrite the animation as a function of `progress`. If a scene
   animated with `transition`, `animation` or an `animate-` class, replace it with `interpolate`
   inline in the style object. Neither of these renders, and the second one looks fine in the
   preview right up until the export is wrong.

3. **Coverage.** One scene per beat, in the plan's order, keyed by real beat ids.

4. **The controls.** Between two and eight per scene, each one something a creator would actually
   turn, each one read in the component.

5. **What is on screen.** Are you drawing the mechanism, or setting the narration as text? If a
   scene is mostly sentences, replace them with the thing the sentences describe.

Return one complete corrected set. Do not discuss the violations outside the structured output.
