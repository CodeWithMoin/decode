"""The Visual Director's production-wide direction prompt."""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
