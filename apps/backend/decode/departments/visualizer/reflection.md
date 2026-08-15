The first set of scenes failed validation. Repair every scene once, addressing each listed
violation without changing the approved plan or narration.

Check in this order:

1. **Composition validity (the `hf_*` violations).** These come straight from the HyperFrames
   linter and have exact answers. Common ones: a missing `data-start="0"` on the root; a CSS
   initial `transform`/`opacity` fighting a GSAP tween on the same property (set the `from` state
   inside `gsap.fromTo` instead); a non-deterministic call (`Date.now`, unseeded `Math.random`,
   network, `repeat: -1`); an animated element that is not a `class="clip"` with `data-*` timing; or
   a duplicate `id`. Fix them literally.

2. **The timeline contract especially.** There must be exactly one
   `gsap.timeline({ paused: true })`, built synchronously and registered on
   `window.__timelines["<composition-id>"]`. Do not animate `display` or raw `visibility`.

3. **Never a hardcoded time.** The root `data-duration` stays the literal `{{SCENE_DURATION}}`
   token, and each beat's start is read from `window.__decodeTiming` by name — not a number you
   wrote. Declare every animated moment in `beats` with an anchor.

4. **Coverage.** One scene per beat, in the plan's order, keyed by real beat ids.

5. **The controls.** Between two and eight per scene, each one something a creator would actually
   turn, each one the composition actually uses.

6. **What is on screen.** Are you drawing the mechanism, or setting the narration as text? If a
   scene is mostly sentences, replace them with the thing the sentences describe.

Return one complete corrected set. Do not discuss the violations outside the structured output.
