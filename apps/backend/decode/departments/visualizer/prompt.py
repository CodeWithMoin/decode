"""Where the Visualizer's craft lives.

Available placeholders in instructions.md:

    {visual_direction}  audience, depth and brand colours as JSON
    {beats}             each approved beat with its narration, as JSON
    {scene_api}         the surface a scene is allowed to import, as text

`scene_api` is passed in rather than written into the prompt: it is the same
declaration the runtime package exports, so the model and the browser cannot be
shown two different APIs.
"""

from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)
