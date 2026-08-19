"""The degraded placeholder must pass the same gate as generated scenes —
otherwise substituting it at retry exhaustion would fail assembly anyway."""

from decode.agents.renderer.validation import validate_scenes
from decode.execution.graph import _degraded_scene_output
from decode.schemas import Beat, BriefSupport, PlanSection, SceneVisuals, TeachingPlan


def _plan(beat_id: str, title: str) -> TeachingPlan:
    return TeachingPlan(
        structure_name="Concept ladder",
        sections=[PlanSection(id="hook", title="Hook", purpose="p")],
        through_line="x",
        rationale="r",
        beats=[
            Beat(
                id=beat_id,
                title=title,
                objective="o",
                target_duration_seconds=30,
                section_id="hook",
                key_points=["k"],
                brief_support=BriefSupport(key_concepts=["c"]),
            )
        ],
    )


def test_degraded_scene_passes_validation():
    title = 'A "Quoted" Title'
    out = _degraded_scene_output("beat-1", title)
    assert out["degraded"] is True
    visuals = SceneVisuals.model_validate(out["visuals"])
    violations = validate_scenes(visuals.scenes, _plan("beat-1", title), palette={"accent": "#5EE6A0"})
    assert violations == []
