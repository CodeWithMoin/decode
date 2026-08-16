# The Direction-Loop Pivot

_Recorded 2026-08-16. A strategic decision, not a proposal. Supersedes the
"auto-director" ambition wherever the two conflict._

## The bet — locked (2026-08-16)

**Decode's one sentence:** the best tool in the world for **provably-correct
technical explainers** — visuals that aid memory and understanding *because they
are true*, structured the way people actually learn.

This is a positioning + depth bet, not a mechanics bet. The mechanics — planning,
a chat direction loop, screenshot-and-verify — are **table stakes**. Competitors
(Osmo, Motion.so) already have them and will match anything we build there;
Osmo's own transcripts show it plans a strong arc, screenshots, catches its own
z-order/sync bugs, and reports honestly. The one edge a funded generalist won't
follow is **correctness** — because their customer wants "looks like it explains,"
and ours needs "is actually right." A wrong diagram teaches a wrong mental model,
which is worse than none; for education that's the whole product, not a nicety.

### The core mechanism: correctness by derivation

**The visual is generated from a running model of the concept — not from the AI's
impression of it.** Don't draw a plausible attention diagram; compute a real
softmax and draw *those* weights. Don't guess which Bloom-filter cells light; run
the hash functions and light *those*. The picture is a projection of the truth,
so it cannot be wrong, and you can point at where every number came from.

Why this actually works — the deepest reason:

> LLMs are **reliable at writing correct executable code** (it's testable) and
> **unreliable at drawing correct diagrams** (it isn't). So move the correctness
> burden from "draw it right" to "implement it right." The diagram becomes a
> projection of code we can test.

**Facts are locked by the model; presentation is free for the human to direct.**
The human owns metaphor, look and pacing; the indices, weights and verdicts come
from running real code. Creative freedom on top of a truth that can't drift.

**Boundary (be honest):** this applies to the large **executable** class —
algorithms, data structures, ML mechanics, math, systems, protocols. Genuinely
non-executable / conceptual topics have no trace to derive from and fall back to
human-directed illustration *without* the provability guarantee. The wedge is the
executable class; it's enormous in technical education, and it's where a
generalist won't go.

### Why it's better for memory (grounded, not vibes)

- **Correct + derived → deep and interactive.** Change the input, the visual
  updates correctly because it's driven by a real model. Manipulable + concrete is
  what makes it stick.
- **Dual coding.** Word and picture must hit the same idea at the same instant —
  the narration-as-timing spine (ADR-005) is built for exactly this.
- **Worked examples, one-idea-per-beat, concrete-before-abstract, cognitive-load
  control** — the Director optimizes for retention, not runtime.

The stack we built is **re-aimed, not rebuilt**: narration-timing → dual coding;
Evaluator/DeepEval → accuracy + comprehension checks; the iterative f(frame)
authoring loop → faithful execution; human direction → the creative.

## First proof (depth-first, one concept)

Prove the bet on ONE executable concept (Bloom filter or a sort) end to end:

1. **Model.** The AI writes a real, tested implementation of the concept
   (`bloom.py`) — correctness of the *model* is verified by running it / unit
   tests, the thing LLMs are good at.
2. **Trace.** Run it on chosen inputs → a ground-truth trace, e.g.:
   `[{op:add, item:"geeks", indices:[1,4,7], bits_after:[…]}, …,
     {op:query, item:"cat", indices:[1,3,7], read:[1,1,1],
      verdict:"probably_present", truth:"absent", false_positive:true}]`
3. **Direct.** Human directs presentation (metaphor, palette, pacing); the Director
   structures the trace into learning beats. Facts stay locked to the trace.
4. **Author.** The f(frame) scene is **data-bound to the trace** — cells lit =
   `step.indices`, verdict = `step.verdict` — built iteratively, verified by sight
   per step.
5. **Verify — provably.** Assert the rendered scene's data equals the trace
   (arrows land on `step.indices`, the verdict matches). Correctness is a *test*,
   not an eyeball.

If we can show "this diagram is provably right because it came from the real thing,
it's directable, and it teaches" on one concept — the wedge is real, and the rest
is generalizing `model → trace → present → verify` to the next concept.

**Authoring-substrate note:** author in **f(frame)** (Remotion-style, where Decode
started), built **iteratively with sight**, not one-shot GSAP timelines. Whether
HyperFrames survives as a render/export target is a downstream infra call to make
*after* the f(frame) loop proves the quality bar — not a blocker now.

## What we learned (the hard way, in one session)

We spent a session trying to make the agent graph **auto-generate** a finished
educational video from source material — Producer → Director → Writer → Visual
Director → Renderer, each getting better prompts, skills, an Analogy helper, a
palette chooser, on-demand craft. We rendered a full Bloom-filter video end to
end. Then we actually **looked at the frames**:

- Scenes rendered to **fully black frames** (elements in the DOM, never visible).
- SVG "hash arrows" pointed into **empty space** — hardcoded coordinates that
  connected to nothing.
- Faint grey line-art floating in a void; everything crammed in a corner.
- The only gate, `hyperframes lint`, **passed all of it** — blank and broken are
  both structurally valid. Nothing in the pipeline ever looked at a pixel.

Counting `<svg>`/shape tags as "proof of quality" was worthless. The lesson that
mattered: **verification means looking at the rendered frame, not the DOM.**

Then, by hand — with taste and eyes on every frame — we authored a decent
Bloom-filter explainer (`scratchpad/build_bloom.py`, the geeks/nerd/cat worked
example from GeeksforGeeks). It was *competent*. The user still didn't like it —
**because the creative calls (metaphor, pacing, tone, look) were the assistant's,
not the user's.** Competent-and-not-yours is still wrong.

## The realization (the user's, and it's correct)

> Creativity is the human's. The human is the driver; the AI is the assistant
> that executes whatever creative the user asks for.

Sharper form, because it makes the product stronger, not weaker:

> **The AI must not originate the creative vision. It amplifies the human's.**
> The human owns the metaphor, the look, the feeling, the pacing. The AI's hard
> problems are **faithfulness** (do exactly what was asked) and **sight** (see and
> preview what it made, so the human can direct visually and iterate in seconds) —
> **not taste.** The AI may offer options; the human is always the selector.

This is not a retreat. Decode's own design already said it — "the user directs,
scene by scene", "a novice can drive it, and that outranks taste", "everything
the room can do, a hand can do", the direction loop as the priority. The
auto-director push was fighting our own thesis. Of course it produced generic
slop: nobody was driving.

## Decision: rebuild around the direction loop

Drop "prompt → finished video, hope it's good." Build the **direction-and-execution
loop**: the human directs a scene in words, the AI executes exactly that and
previews it, the human pushes back, it adjusts — tight, fast, faithful, with the
human steering every meaningful choice. Agents become **executors of explicit
human intent**, not autonomous creatives.

## The competitive question — and the honest answer

Competitors (Osmo, Motion.so) already have a "tell it what to do and it does it"
loop. **So the loop itself is table stakes, not an advantage.** A funded generalist
beats us at generic. The edge is *what the loop is pointed at* and *how faithfully
it executes* — three structural things a general prompt→video tool can't do well
because it optimizes for something else:

1. **Vertical: correct teaching, not pretty video.** They optimize for *looks
   cool*. Teaching optimizes for *a smart person actually understands afterward* —
   a harder, narrower, stickier target. The diagram has to be **true**: bits set at
   the right indices, the arrow landing on the cell it actually hashes to, the
   false positive flagged for the right reason. A generalist can't afford
   correctness over polish. We can. Best-at-one-thing beats 4th-best generalist.

2. **The explanation is the spine (narration-as-timing, ADR-005).** Our video is
   authored against the argument as it unfolds — narration drives all timing, any
   moment pins to the exact word that names it ("flash these cells when I say
   *false positive*"). Marketing/music tools are built around scenes or beats, not
   an idea being explained. This is the data model that makes fine-grained teaching
   direction possible; they'd have to rebuild their core to get it.

3. **Faithful, fine-grained, verifiable execution.** Their loop is coarse and
   black-box: prompt → a video → regenerate and pray. Ours is a director's chair:
   touch any scene, beat, element, or word-level timing anchor; every AI action
   maps to a hand control; and it **sees what it made and shows you** before
   shipping. "Retime this reveal to the word 'taken'", "make cell 4 the focus",
   "this beat is a transition from A to B, not a fade-in" — that grain, executed
   faithfully and previewed in seconds, is a different tool than "make me a video."

**Positioning:** they sell "the AI makes your video." We sell "**you direct, and it
executes your explanation flawlessly — and correctly.**" When the market discovers
what the user just discovered (auto-creativity is mid), the tool built for a person
who cares that it's *right* and it's *theirs* wins those users. The rest get the
generic box; they were never our customer.

**Blunt caveat:** none of this is a moat unless we execute the narrow thing
*dramatically* better than them. Depth in the vertical **is** the strategy. Resist
going wide.

## Concrete authoring lessons (proven by the hand-built video)

The craft rules the pipeline must enforce — learned by hand-authoring a good one:

- **Connectors anchor to real element coordinates.** The model's arrows used random
  hardcoded coords → pointed at nothing. Compute the target's position; draw to it.
- **One persistent stage; swap states on top.** The bit row stays put; only the
  item / arrows / verdict change. Rebuilding everything per beat leaves black gaps.
- **Reach a complete readable state and HOLD it.** Most sampled frames should be a
  finished diagram, not mid-transition or empty.
- **Fill the frame; large and legible.** No faint line-art in a black void.
- **Draw the objects; text is labels only.** (Already in the contract — but the
  above are the ones that were actually missing.)
- **Structure the teaching:** hook (a felt problem) → why not the obvious way →
  what it is → worked example with real values → the catch → the payoff/limits →
  real applications → close. (The GeeksforGeeks Bloom-filter article is the model.)

## What the rebuilt loop needs (so the advantage is built in, not asserted)

- **Word-/element-level direction**, not scene-prompts — leans on the
  narration-timing spine we already have.
- **Faithfulness + sight** — the AI executes exactly what was asked and **verifies
  visually** (snapshot → look → repair) before showing the human. This is the
  Animation-Reviewer-with-eyes idea; it is the actual hard problem, not taste.
- **Correctness guardrails** — it won't render a teaching lie.

## Status of the auto-director work

Not wasted, but demoted. The agent graph, HyperFrames substrate, narration-timing,
palette, Analogy helper, on-demand skills all **become the execution engine the
human directs** — not an autonomous author. Keep the plumbing; drop the ambition of
it driving itself.
