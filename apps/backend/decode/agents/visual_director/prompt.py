"""The Visual Director's SkillSet singleton.

Mirrors every other department's `prompt.py` (e.g. `visualizer/prompt.py`): the folder
describes itself in SKILL.md and this exposes it once. The Visual Director is an agent
on the slice-1 runtime rather than a pipeline stage, so this is read by `AgentConfig`
(model, skills, multiagent) — it is deliberately not imported by the pipeline's
`_discover()`, so the department pipeline does not gain a `generate_visual_plan` stage.
"""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
