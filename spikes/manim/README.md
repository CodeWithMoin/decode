# Manim substrate spike — 2026-08-19

Question: should the Motion Designer emit Manim CE (Python, offline render)
instead of Remotion React? Run before deciding, per the renderer-port design
(`providers/renderer.py` is the swappable boundary).

Method: gpt-5.6-luna authored the same two DNS beats twice — the shipped
Remotion path vs Manim CE (`gen_manim.py`, one prompt, no repair round) —
identical narration, palette rules, and teaching objectives. Rendered with
`manim -ql --fps 15`. Side-by-side with playable renders: the "Manim Spike
Verdict" artifact (linked in the working chat).

Result:
- **Composition/density/teaching structure: Manim, decisively.** Both scenes
  assembled cumulatively (zero FadeOut, unprompted), filled the frame, and the
  same playhead positions that were black/near-empty under Remotion held full
  diagrams. The training-data advantage is real: the model already knows Manim.
- **Timing:** both scenes landed within 0.2s of the narration target from one
  instruction.
- **Not flawless:** off-frame text on one edge, one squished label — the
  vision gate stays necessary on any substrate.
- **Costs confirmed:** ~35–60s/scene draft renders on an M-series laptop; no
  live preview, no live controls; retiming narration = re-render; generated
  Python requires containerised execution (security-guardrails item) before
  untrusted input.

**DECIDED (2026-08-19): stay on Remotion.** The interactive edit experience —
instant preview, live Inspector controls, free narration retiming — is the
product, and Manim's output quality doesn't outweigh losing the direction
loop's immediacy. The path to closing the quality gap on our own substrate is
`docs/CHOREOGRAPHY-API.md`: Manim's model (persistent scene graph, verb
vocabulary, runtime-owned motion), our renderer. A full 2-minute Bloom filters
film was also produced during the spike as end-to-end evidence
(`apps/frontend/public/renders/bloom-filters-manim.mp4`); the code here stays
for provenance, not as a live path.
