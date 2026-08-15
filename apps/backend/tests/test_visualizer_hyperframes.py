"""The Visualizer→HyperFrames authoring seam (VISUALIZER-TO-HYPERFRAMES §5).

Decode resolves a scene's anchored beats against the narration, stamps the scene
length and injects the resolved `{beat, start, duration}` metadata, and the real
HyperFrames linter accepts the result. The composition below is a TEST FIXTURE
that exercises the contract — the model authors the real ones against
`references/hyperframes-composition.md`; nothing here ships as a scene.
"""

import shutil

import pytest

from decode.agents.visualizer.composition import (
    DURATION_TOKEN,
    TIMING_MARKER,
    resolve_scene,
    stamp,
)
from decode.agents.visualizer.lint import lint_composition
from decode.schemas import VisualBeat
from decode.timing import Anchor, NarrationTiming, even_split_words

# A minimal, contract-valid composition: root with data-*, one .clip, one paused
# timeline reading window.__decodeTiming, the duration + timing markers Decode fills.
FIXTURE_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #stage-bg { position: absolute; inset: 0; background: #0b0b0b; }
      #label { position: absolute; inset: 0; display: grid; place-items: center;
               font-family: system-ui, sans-serif; font-size: 56px; color: #e8e8ec;
               will-change: transform, opacity; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0"
         data-duration="{{SCENE_DURATION}}" data-width="1920" data-height="1080">
      <div id="stage-bg"></div>
      <div id="label" class="clip" data-start="0"
           data-duration="{{SCENE_DURATION}}" data-track-index="1">Self-Attention</div>
    </div>
    <!-- decode:timing -->
    <script>
      window.__timelines = window.__timelines || {};
      const timing = window.__decodeTiming || [];
      const at = (name) => timing.find((t) => t.beat === name) || { start: 0, duration: 0.6 };
      const tl = gsap.timeline({ paused: true });
      const reveal = at("reveal");
      tl.fromTo("#label", { opacity: 0 },
        { opacity: 1, duration: reveal.duration, ease: "power4.out" }, reveal.start);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""


def _narration() -> NarrationTiming:
    text = "Self attention weighs every token against every other token"
    return NarrationTiming(duration=4.0, words=even_split_words(text, 4.0))


def test_beats_resolve_to_timing_metadata_against_the_narration():
    beats = [
        VisualBeat(name="ambient", anchor=Anchor(name="ambient", kind="progress", at=0.0)),
        VisualBeat(
            name="reveal",
            anchor=Anchor(name="reveal", kind="phrase", phrase="every token", align="start"),
            duration_s=1.2,
        ),
    ]
    resolved = resolve_scene(beats, _narration())

    assert not resolved.unresolved
    by_name = {m.beat: m for m in resolved.metadata}
    assert by_name["ambient"].start == 0.0
    assert by_name["reveal"].start > 0.0  # lands on the words, not scene start
    assert by_name["reveal"].duration == 1.2
    # Metadata is ordered by start — the ambient fade before the phrase reveal.
    assert [m.beat for m in resolved.metadata] == ["ambient", "reveal"]


def test_an_unresolvable_beat_is_surfaced_not_dropped():
    beats = [
        VisualBeat(
            name="reveal",
            anchor=Anchor(name="reveal", kind="phrase", phrase="not in the script"),
        )
    ]
    resolved = resolve_scene(beats, _narration())
    assert resolved.metadata == []
    assert resolved.unresolved[0].name == "reveal"


def test_stamp_fills_the_duration_and_injects_the_resolved_timing():
    beats = [VisualBeat(name="reveal", anchor=Anchor(name="reveal", kind="progress", at=0.1))]
    resolved = resolve_scene(beats, _narration())
    out = stamp(FIXTURE_HTML, 4.0, resolved.metadata)

    assert DURATION_TOKEN not in out  # duration placeholder filled
    assert TIMING_MARKER not in out  # timing marker replaced
    assert 'data-duration="4"' in out
    assert "window.__decodeTiming" in out
    assert '"beat": "reveal"' in out


@pytest.mark.skipif(shutil.which("npx") is None, reason="npx/hyperframes CLI unavailable")
def test_the_stamped_composition_passes_the_real_hyperframes_linter():
    beats = [VisualBeat(name="reveal", anchor=Anchor(name="reveal", kind="progress", at=0.0))]
    resolved = resolve_scene(beats, _narration())
    out = stamp(FIXTURE_HTML, 4.0, resolved.metadata)

    result = lint_composition(out)
    if not result.ran:
        pytest.skip(f"hyperframes lint could not run: {result.detail}")
    assert result.ok, [f.model_dump() for f in result.findings]
    assert result.error_count == 0
