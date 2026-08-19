"""The deliberately small prompt for raw Remotion scene authoring.

The earlier long Decode doctrine made the model spend its attention satisfying a
layout API instead of composing the frame. Production now follows the successful
control experiment: a concrete brief, ordinary React/SVG, and Remotion's standard
frame-driven techniques. Safety and output correctness remain deterministic code,
not prose repeated to the model.
"""

import hashlib
import json
from pathlib import Path

from ..skills import SkillSet

SKILLS = SkillSet(Path(__file__).parent)

REPAIR_PROMPT = """Repair only the deterministic violations listed below. Preserve the scene's
visual idea and composition. Return the complete corrected scene draft."""


# One palette per video. Each scene is generated in its own call and cannot see
# its siblings, so style consistency has to arrive as data: the palette is picked
# deterministically from the plan (same project -> same palette, no extra model
# call) and injected into every beat's brief. Creator brand colors, when present,
# override the accent (the prompt already says so).
# Semantic slots (positive/negative/warn) exist because teaching frames need
# meaning-colors — a "definite no" is red whatever the accent is. Scenes may use
# them only when the meaning calls for it; the accent stays the one emphasis hue.
PALETTES = [
    {"surface": "#151A21", "border": "#3A4656", "ink": "#F2F5F8", "support": "#8B98A9", "accent": "#55E6FF", "positive": "#5EE6A0", "negative": "#FF5C70", "warn": "#FFC857"},
    {"surface": "#1A1714", "border": "#4A4034", "ink": "#F7F3EC", "support": "#A39682", "accent": "#F4B860", "positive": "#7FE0A5", "negative": "#FF6B62", "warn": "#FFD28C"},
    {"surface": "#141A16", "border": "#37493C", "ink": "#F0F6F1", "support": "#8FA394", "accent": "#5EE6A0", "positive": "#8FE6C0", "negative": "#FF7A70", "warn": "#F2CE72"},
    {"surface": "#1A141C", "border": "#473A4E", "ink": "#F5F0F7", "support": "#A08FA9", "accent": "#C08FFF", "positive": "#79E0B0", "negative": "#FF6E85", "warn": "#F5C86E"},
    {"surface": "#1A1518", "border": "#4E3A44", "ink": "#F7F0F3", "support": "#A98F9C", "accent": "#FF8FA8", "positive": "#74E0AC", "negative": "#FF5C70", "warn": "#F7CD75"},
]


def pick_palette(seed: str) -> dict:
    digest = hashlib.md5(seed.encode()).digest()
    return PALETTES[digest[0] % len(PALETTES)]


def build_instructions(*, visual_direction: dict, beats: list[dict]) -> str:
    brief = {
        **visual_direction,
        "canvas": {"width": 1920, "height": 1080},
        "stage": "#0B0B0B (painted by the host, behind every scene)",
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
- Place elements RELATIONALLY with the layout primitives from `@decode/animation-api` — state the
  relationship, let the component own the geometry:
  - `Stack` / `Row` — every group of siblings, with a real `gap` (they can never collide).
  - `Anchor` — every caption or label near an element: `<Anchor side="right" gap={{24}}
    label={{<Label .../>}}>{{subject}}</Anchor>`. Never absolutely position a label next to a thing.
  - `Label` — EVERY standalone piece of text: `text`, `size`, and a `maxWidth`; it measures itself
    and steps its size down to fit, so text cannot overflow or break mid-word.
  - `Connector` — the relationship BETWEEN two elements: put both as its two children and it draws
    the line (optional `arrow`, `dashed`) and owns the between-label:
    `<Connector direction="row" arrow label={{<Label .../>}}>{{a}}{{b}}</Connector>`. Never float
    free text or a hand-drawn line between two elements.
  Absolute pixel positioning is allowed only INSIDE an `<svg>` diagram you draw. Every `<svg>`
  declares a viewBox and keeps all coordinates inside it (outside = clipped invisibly); colors are
  palette hex values, never names. Do not use the legacy helpers `DesignCanvas`, `defineLayout`,
  `LayoutBox`, or `LayoutText`.
- Drive every changing value from `useCurrentFrame()`. Use `useVideoConfig()` for fps and
  durationInFrames. Use `interpolate()` or `spring()` with clamped ranges.
- Never use CSS transitions, CSS animations, keyframes, timers, network calls, or unseeded
  randomness.
- Use inline styles. Keep important content comfortably inside the frame and avoid collisions,
  clipping, tiny text, empty labelled boxes, and decorative dashboard clutter.
- Layout numbers (design pixels on the 1920x1080 canvas; full spec: docs/SCENE-DESIGN-RULES.md):
  keep all text and focal objects inside a 96px safe margin; sibling surfaces >= 48px apart;
  distinct groups >= 96px apart; arrows start and end 8px off a surface's edge, never under it;
  a label sits 12-16px from the shape it names.
- Cards of the same role are a family: size every card to fit the family's LONGEST string — same
  width and height, so siblings align. Padding inside a card: horizontal max(24px, 1.25x font
  size), vertical max(16px, 0.75x font size); text never touches a border — if the longest string
  would force it, shrink the whole family's font, not one card. One-line labels centered,
  multi-line left-aligned at line-height 1.35, wrapped near 32 characters.
- Type floors: support text 20px, labels 24px, focal words/numbers 64px+; the focal element is
  >= 2.5x its support text. Leave real negative space — roughly a third of the frame stays empty.
- Scale floor: content spans >= 60% of frame width and 50% of height at every frame; a dominant
  `<svg>` diagram is >= 1200x650 with shapes sized to use it. Negative space frames the edges —
  never a large empty region beside a miniature drawing.
- Elements must never overlap — at any frame, including while one element enters as another exits.
  Give every element its own region of the frame and keep entering elements out of a region until
  its previous occupant has fully left. A moving element keeps >= 24px clearance from everything
  else along its entire path; connectors may pass near surfaces but never cross text.
- No slide furniture: no title-and-subheading block parked in a corner, no page or step counters
  ("1/3", "step 2 of 5", progress dots), no footer strips, no bullet lists. The narration names the
  beat — on-screen words are short labels inside the picture, never headings above it. A large word
  or number appears only when it is itself the focal subject, staged center-stage.
- Space the reveals across the full duration: the final segment's reveal lands in the last third of
  the scene, never everything in the first second followed by a frozen frame.
- BUILD, never erase: the scene is one diagram assembling. Once an element appears it STAYS —
  dim it to make room for the next idea, never fade it out — so no frame is ever empty or
  near-empty, and the final frame contains the whole scene's picture. A sequence of one-at-a-time
  vignettes on a black stage is the single worst failure this scene can have.
- The real duration is stamped later from narration: compute every reveal boundary from
  `useVideoConfig().durationInFrames`, never literal frame numbers — hardcoded frames play the
  whole story in seconds, then freeze.
- The host paints the stage behind every scene. Your root element MUST be transparent — never paint
  a full-frame background color, gradient, or vignette. Paint only your surfaces, shapes and text;
  the dark stage shows through everywhere else, and it is what keeps the whole video feeling like
  one film instead of a deck of slides.
- Use exactly the `palette` in the production direction for every color decision. Surfaces,
  borders, primary and support text and the single accent come from their named slots; `positive`,
  `negative` and `warn` exist for frames whose meaning needs them (a definite no, a success, a
  caution) and for nothing else. Do not invent hues outside the palette; vary emphasis with opacity
  and weight, not new colors. Tints must stay in a palette color's hue family. Brand colors in the
  direction, when present, replace the accent.
- Follow the creator's art direction and brand constraints within that palette.
- Show the relationship or mechanism in the beat. Keep on-screen copy to short labels.
- Stage the narration segments in order across the whole scene duration rather than revealing
  everything immediately.
- Default-export `function Scene(props)`. Return exactly one scene for each requested beat and keep
  the same beat IDs and order.
- Declare two to six useful creator controls separately in the structured `controls` field. Do not
  write a `CONTROLS` export inside the TSX.

Write the complete components now."""
