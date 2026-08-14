"""The Narrator's skill set — loaded once, read on demand."""

from __future__ import annotations

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
