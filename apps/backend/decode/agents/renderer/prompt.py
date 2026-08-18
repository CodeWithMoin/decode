"""The deliberately small prompt for raw Remotion scene authoring.

The earlier long Decode doctrine made the model spend its attention satisfying a
layout API instead of composing the frame. Production now follows the successful
control experiment: a concrete brief, ordinary React/SVG, and Remotion's standard
frame-driven techniques. Safety and output correctness remain deterministic code,
not prose repeated to the model.
"""

import json
from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)

REPAIR_PROMPT = """Repair only the deterministic violations listed below. Preserve the scene's
visual idea and composition. Return the complete corrected scene draft."""


def build_instructions(*, visual_direction: dict, beats: list[dict]) -> str:
    brief = {
        **visual_direction,
        "canvas": {"width": 1920, "height": 1080},
    }
    return f"""Create one complete Remotion TSX scene for every beat below.

## Production direction
{json.dumps(brief, ensure_ascii=True, indent=2)}

## Beats
{json.dumps(beats, ensure_ascii=True, indent=2)}

## Remotion authoring guidance
- Design for a fixed 1920x1080 video frame with a generous safe margin.
- Use normal React elements and SVG. Build the frame around one dominant visual idea.
- Import runtime values only from `@decode/animation-api`. It re-exports standard Remotion APIs such
  as `AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`, and `Easing`.
- Do not use Decode layout helpers such as `DesignCanvas`, `defineLayout`, or `LayoutBox`; compose
  directly with ordinary CSS, flex/grid, absolute positioning, and SVG as you would in Remotion.
- Drive every changing value from `useCurrentFrame()`. Use `useVideoConfig()` for fps and
  durationInFrames. Use `interpolate()` or `spring()` with clamped ranges.
- Never use CSS transitions, CSS animations, keyframes, timers, network calls, or unseeded
  randomness.
- Use inline styles. Keep important content comfortably inside the frame and avoid collisions,
  clipping, tiny text, empty labelled boxes, and decorative dashboard clutter.
- Follow the creator's art direction and brand constraints. When they leave a choice open, make a
  deliberate choice that fits the subject rather than falling back to a house palette.
- Show the relationship or mechanism in the beat. Keep on-screen copy to short labels.
- Stage the narration segments in order across the whole scene duration rather than revealing
  everything immediately.
- Default-export `function Scene(props)`. Return exactly one scene for each requested beat and keep
  the same beat IDs and order.
- Declare two to six useful creator controls separately in the structured `controls` field. Do not
  write a `CONTROLS` export inside the TSX.

Write the complete components now."""
