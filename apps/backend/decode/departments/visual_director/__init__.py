"""The Visual Director — the Motion Designer as a coordinator agent.

It reads the approved plan, script and intent and produces an abstract `visual_plan`
(a metaphor and narration-anchored moments per beat), then delegates the composition to
the Renderer sub-agent (the `visualizer/` department, unchanged) and the motion critique
to the animation-reviewer. It sits *beside* the department pipeline on the slice-1 Agent
runtime; the persisted `scene_visuals` contract the Renderer produces is untouched.

Fake-first: `FakeVisualDirector` (fixtures) produces a deterministic `VisualPlan`, and a
delegation round-trip runs offline on `FakeAgentRuntime`. Real providers are not flipped.
"""
