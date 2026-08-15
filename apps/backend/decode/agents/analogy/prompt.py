"""The Analogy helper's SkillSet singleton.

Mirrors every other agent's `prompt.py`: the folder describes itself in SKILL.md and
this exposes it once for `AgentConfig` (model, skills). The Analogy helper is an inline
sub-agent on the runtime, delegated to by the Director / Writer / Visual Director — it is
not a pipeline stage, so it is deliberately not imported by the pipeline's `_discover()`.
"""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
