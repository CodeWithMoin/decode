# Scene design rules

Layout, spacing, and text rules every generated scene must satisfy. The Motion Designer prompt
(`apps/backend/decode/agents/renderer/prompt.py`) carries the compact form of these rules; this
document is the authoritative spec with rationale. All values are design pixels on the fixed
1920×1080 canvas.

## 1. Safe area

- **96px margin on all four sides.** Text, diagrams, and focal objects stay inside the
  1728×888 safe rectangle. Only atmosphere (glows, faint connectors running off-frame) may leave it.
- Nothing readable ever touches the frame edge.

## 2. Spacing between elements

- **Sibling surfaces** (cards, chips, shapes in the same group): ≥ **48px** apart.
- **Distinct groups** (e.g. the "before" cluster vs. the "after" cluster): ≥ **96px** apart, so the
  grouping is legible without labels.
- **Connectors** (arrows, lines) bridge those gaps: they start and end **8px off** a surface's edge
  (never at its center, never under it), and their labels sit **12px** off the line on the side
  with more free space.
- A label describing a shape sits **12–16px** from that shape's edge, never overlapping it.

## 3. Text in cards — padding from the longest string

Cards of the same role (a row of option chips, a column of step cards) form a **family**. Per family:

- Measure the **longest text in the family** at the family's font size. Size **every** card in the
  family to fit that longest string — same width, same height — so siblings align and nothing wraps
  differently from its neighbors.
- **Horizontal padding:** max(24px, 1.25 × font size). **Vertical padding:** max(16px, 0.75 × font size).
- Text never touches a card border; if the longest string would force it, shrink the font for the
  whole family, not just the long card.
- One short label per card is **centered**; two or more lines are **left-aligned** with
  line-height 1.35.

## 4. Type

- **Minimum sizes:** support/annotation text 20px, labels 24px, focal words/numbers 64px+.
  Nothing below 20px, ever — it is unreadable at 720p.
- **Scale contrast:** the focal element is ≥ 2.5× the size of its support text. Two text colors
  only (ink + support from the palette); emphasis by size and weight, not extra colors.
- **Line length:** wrap multi-line text at ~32 characters; a paragraph of narration never appears
  on screen — on-screen copy is short labels inside the picture.

## 5. Placement

- Allocate the frame into **non-overlapping regions** before drawing: one region per major element
  or group, positioned absolutely; flex/grid inside a region.
- The single focal element sits at or near the optical center (slightly above true center); support
  elements sit around it, never crowding the same quadrant.
- Leave real negative space — at least ~30% of the safe area stays empty in a settled frame.

## 6. Collisions and motion

- **Elements never overlap at any frame**, including mid-transition. An entering element stays out
  of a region until its previous occupant has fully left (opacity 0 and off its slot).
- A moving element keeps ≥ **24px clearance** from everything else along its entire path.
- Connectors and glows are the only things allowed to pass near surfaces; they still never cross
  text.
- After the last reveal settles, at most one continuous motion system remains, and only if it shows
  an ongoing process.

## 7. Reveal spacing in time

- Stage one moment per narration segment across the full scene duration; the final reveal lands in
  the last third. Never everything in the first second followed by a frozen frame.
