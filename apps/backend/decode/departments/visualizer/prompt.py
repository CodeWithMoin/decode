"""Where the Visualizer's craft lives.

Available placeholders in instructions.md:

    {visual_direction}      audience, depth and brand colours as JSON
    {beats}                 each approved beat with its narration, as JSON
    {composition_contract}  the HyperFrames composition contract, as text

`composition_contract` is passed in rather than written into the prompt so the
authoring rules the model reads and the linter that enforces them stay one
source (`references/hyperframes-composition.md`, gated by `hyperframes lint`).
The legacy React contract lives on in `references/scene-api.md` for the
migration window.
"""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
