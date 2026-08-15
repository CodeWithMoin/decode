"""Where the Author's craft lives.

Available placeholders in instructions.md:

    {narration_direction}  audience, depth and narration style as JSON
    {plan}                 the approved Teaching Plan as JSON

Narration style *is* present here, unlike the Architect's. It is the one piece
of the creator's direction that belongs to this department and no other: it
changes how the words sound, never what they teach.
"""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
