"""Where the Intake department's craft lives.

Available placeholders in instructions.md:

    {production_direction}  audience, depth, runtime target, and creative brief as JSON
    {source_count}          int

Narration style is intentionally absent. It belongs to the Writer.
"""

import json
from pathlib import Path

from ...schemas import ProductionIntent
from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)


def build_instructions(intent: ProductionIntent, source_count: int) -> str:
    """Substitute this run's direction into the template.

    Kept here rather than on SkillSet because the placeholder set is the
    department's own contract with its instructions.md.
    """
    return SKILLS.instructions(
        production_direction=json.dumps(
            {
                "audience": intent.audience,
                "depth": intent.depth,
                "runtime_mode": intent.runtime_mode,
                "target_duration_seconds": intent.target_duration_seconds,
                "creative_brief": intent.creative_brief,
            },
            ensure_ascii=True,
            indent=2,
        ),
        source_count=source_count,
    )
