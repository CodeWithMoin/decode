"""Where the Architect's craft lives.

Available placeholders in instructions.md:

    {planning_direction}  audience, depth, runtime target, and creative brief as JSON
    {brief}               the approved Production Brief as JSON

Narration style is intentionally absent. It belongs to the Writer and must not
quietly reshape the Director's curriculum plan.
"""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
