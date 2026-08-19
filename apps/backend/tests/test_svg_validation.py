"""Strict SVG gates: the free-positioning zone is where scenes go bad."""

from decode.agents.renderer.validation import _validate_svg
from decode.schemas import SceneModule


def _scene(source: str) -> SceneModule:
    return SceneModule(beat_id="beat-1", controls=[], component_source=source)


def _codes(source: str) -> set[str]:
    return {v["code"] for v in _validate_svg(_scene(source))}


GOOD = """
export default function Scene() {
  return (
    <svg viewBox="0 0 1400 700" width="1400" height="700">
      <rect x={100} y={80} width={400} height={200} fill="#5EE6A0" />
      <circle cx="900" cy="350" r="120" fill="#8FE6C0" />
      <line x1="500" y1="180" x2="780" y2="350" stroke="#8FA394" />
      <text x="120" y="340" fontSize="24" fill="#F0F6F1">input</text>
    </svg>
  );
}
"""


def test_valid_svg_passes():
    assert _codes(GOOD) == set()


def test_missing_viewbox():
    assert "svg_missing_viewbox" in _codes("<svg width='800'><rect x='0' y='0' /></svg>")


def test_out_of_bounds_is_clipped_content():
    src = '<svg viewBox="0 0 1200 650"><circle cx="1400" cy="300" r="40" /></svg>'
    assert "svg_out_of_bounds" in _codes(src)
    negative = '<svg viewBox="0 0 1200 650"><rect x="-80" y="10" width="60" height="40" /></svg>'
    assert "svg_out_of_bounds" in _codes(negative)


def test_tiny_viewbox_flagged():
    assert "svg_too_small" in _codes('<svg viewBox="0 0 300 150"><rect x="0" y="0" /></svg>')


def test_named_colors_are_a_palette_bypass():
    src = '<svg viewBox="0 0 1200 650"><rect x="10" y="10" fill="red" /></svg>'
    assert "named_color" in _codes(src)


def test_computed_coordinates_are_skipped():
    src = '<svg viewBox="0 0 1200 650"><rect x={i * 2000} y="10" width="60" height="40" /></svg>'
    assert "svg_out_of_bounds" not in _codes(src)


def _stage_codes(src: str) -> set[str]:
    from decode.agents.renderer.validation import _validate_stage_and_palette

    return {v["code"] for v in _validate_stage_and_palette(_scene(src), None)}


def test_freehand_absolute_layout_flagged():
    divs = "".join(
        f'<div style={{{{ position: "absolute", left: {i * 100}, top: 40 }}}} />'
        for i in range(4)
    )
    src = f"<AbsoluteFill><Label text='x' size={{24}} />{divs}</AbsoluteFill>"
    assert "freehand_absolute" in _stage_codes(src)


def test_transform_excursions_flagged():
    src = (
        "<AbsoluteFill><Stack gap={24}>"
        "<div style={{ transform: `translateX(-2400px) scale(3)` }} />"
        "</Stack></AbsoluteFill>"
    )
    assert "transform_off_frame" in _stage_codes(src)
