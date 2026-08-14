import pytest

from decode.config import Settings
from decode.departments.registry import visualizer as build_visualizer
from decode.departments.visualizer import prompt
from decode.departments.visualizer.validation import (
    RUNTIME_MODULE,
    controls_export,
    module_source,
    validate_scenes,
)
from decode.execution.pipeline import STAGES
from decode.models import ArtifactType
from decode.schemas import (
    Beat,
    BriefSupport,
    PlanSection,
    ProductionIntent,
    SceneControl,
    SceneModule,
    TeachingPlan,
)

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
)

PLAN = TeachingPlan(
    structure_name="Question to answer",
    sections=[PlanSection(id="q", title="The question", purpose="Establish the problem.")],
    through_line="Attention lets a model weigh what matters.",
    rationale="I opened on the failure.",
    beats=[
        Beat(
            id="beat-01",
            title="The bottleneck",
            objective="Explain why the sequence model loses context",
            target_duration_seconds=60,
            section_id="q",
            key_points=["One state cannot hold everything."],
            brief_support=BriefSupport(learning_objectives=[0]),
        )
    ],
)

GOOD = """import { useProgress, interpolate, Easing, AbsoluteFill } from "@decode/animation-api";

export default function Scene(props) {
  const progress = useProgress();
  return (
    <AbsoluteFill style={{
      background: props.background,
      opacity: interpolate(progress, [0, 0.25], [0, 1], { extrapolateRight: "clamp" }),
    }} />
  );
}
"""


def scene(source: str = GOOD, controls: list[SceneControl] | None = None) -> SceneModule:
    return SceneModule(
        beat_id="beat-01",
        controls=controls
        or [SceneControl(name="background", type="color", label="Background", default="#0E0E10")],
        component_source=source,
    )


def codes(source: str) -> list[str]:
    return [item["code"] for item in validate_scenes([scene(source)], PLAN)]


def test_the_stage_is_discovered_from_its_manifest():
    stage = STAGES["generate_scene_visuals"]
    assert stage.produces == ArtifactType.SCENE_VISUALS
    assert stage.consumes == ("script", "teaching_plan", "production_intent")
    assert stage.owner_role == "motion_designer"


def test_shipped_skills_load():
    system = prompt.SKILLS.system()
    assert "untrusted content" in system
    assert RUNTIME_MODULE in system
    api = prompt.SKILLS.reference("scene-api")
    # The reference the model reads and the rule the validator enforces have to
    # describe the same API, or the department is set up to fail its own gate.
    assert "useProgress" in api
    assert "useVideoConfig" in api  # named only to say it is absent
    assert "Easing.bezier" in api


def test_visualizer_requires_a_key(tmp_path):
    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build_visualizer(
            Settings(visualizer="openai", openai_api_key=None, local_object_root=tmp_path)
        )


def test_a_clean_scene_passes():
    assert validate_scenes([scene()], PLAN) == []


def test_imports_outside_the_scene_api_are_rejected():
    assert "forbidden_import" in codes(GOOD.replace('"@decode/animation-api"', '"remotion"'))
    assert "forbidden_import" in codes('import x from "./helper";\n' + GOOD)


def test_reaching_for_code_or_the_network_is_rejected():
    for snippet in ('eval("1")', 'fetch("/x")', "new Function()", 'require("fs")'):
        assert "forbidden_api" in codes(GOOD + f"\n// {snippet}\nconst z = {snippet};")


def test_a_scene_may_not_learn_its_own_duration():
    # The API does not export these, so this is the backstop rather than the
    # lock — but a scene that names them is still refused.
    for snippet in ("const fps = 30;", "const { durationInFrames } = x;", "useVideoConfig()"):
        assert "declares_duration" in codes(GOOD + f"\n{snippet}")


def test_css_motion_is_rejected():
    # The failure that would look right in the preview and be wrong in the file.
    assert "css_motion" in codes(
        GOOD.replace("background:", "transition: 'opacity 0.3s',\n      background:")
    )
    assert "css_motion" in codes(
        GOOD.replace("<AbsoluteFill", '<AbsoluteFill className="animate-pulse"')
    )
    assert "css_motion" in codes(GOOD + "\n// @keyframes spin { }")


def test_a_scene_must_export_a_default():
    assert "no_default_export" in codes(GOOD.replace("export default ", ""))


def test_a_scene_may_not_write_its_own_controls_block():
    assert "declares_controls" in codes(GOOD + "\nexport const CONTROLS = {};")


def test_reading_an_undeclared_control_is_rejected():
    assert "undeclared_control" in codes(GOOD.replace("props.background", "props.mystery"))


def test_missing_and_invented_beats_are_caught():
    found = [item["code"] for item in validate_scenes([], PLAN)]
    assert "missing_scenes" in found


def test_decode_writes_the_controls_block_not_the_model():
    block = controls_export(
        [
            SceneControl(name="background", type="color", label="Background", default="#0E0E10"),
            SceneControl(
                name="speed",
                type="number",
                label="Speed",
                default=1,
                minimum=0,
                maximum=3,
                step=0.1,
            ),
        ]
    )
    assert block.startswith("export const CONTROLS = {")
    assert '"background"' in block and '"#0E0E10"' in block
    assert '"min": 0' in block and '"max": 3' in block
    # The panel reads this as JSON. Nothing executes a module to find its knobs.
    assert module_source(scene()).startswith("export const CONTROLS")


async def test_the_fixture_writes_scenes_that_pass_their_own_gate():
    from decode.departments.fixtures import FakeAuthor, FakeVisualizer

    script = await FakeAuthor().generate(INTENT, PLAN)
    visuals = await FakeVisualizer().generate(INTENT, PLAN, script)
    assert validate_scenes(visuals.scenes, PLAN) == []
    assert visuals.visual_findings["fixture"] is True
    assert visuals.visual_findings["runtime_version"] == "decode-animation-api-v1"


async def test_regenerate_one_rebuilds_only_the_target_beat():
    """The per-scene direction loop: one beat changes, every other is carried
    through untouched, and the result is still a full scene-visuals artifact."""
    from decode.schemas import BeatNarration, Script

    plan = TeachingPlan(
        structure_name="Two beats",
        sections=[PlanSection(id="q", title="Q", purpose="Establish.")],
        through_line="t",
        rationale="r",
        beats=[
            Beat(id="beat-01", title="One", objective="First idea", target_duration_seconds=30,
                 section_id="q", key_points=["k"],
                 brief_support=BriefSupport(learning_objectives=[0])),
            Beat(id="beat-02", title="Two", objective="Second idea", target_duration_seconds=30,
                 section_id="q", key_points=["k"],
                 brief_support=BriefSupport(learning_objectives=[0])),
        ],
    )
    script = Script(rationale="r", beats=[
        BeatNarration(beat_id="beat-01", narration="a"),
        BeatNarration(beat_id="beat-02", narration="b"),
    ])
    prior = [
        SceneModule(beat_id="beat-01", controls=[], component_source="ORIGINAL_ONE"),
        SceneModule(beat_id="beat-02", controls=[], component_source="ORIGINAL_TWO"),
    ]
    fake = build_visualizer(Settings(visualizer="fake"))

    result = await fake.regenerate_one(
        INTENT, plan, script, prior, "beat-02", "make it a nested structure"
    )
    by = {s.beat_id: s for s in result.scenes}
    assert {*by} == {"beat-01", "beat-02"}
    assert by["beat-01"].component_source == "ORIGINAL_ONE"      # untouched
    assert by["beat-02"].component_source != "ORIGINAL_TWO"      # rebuilt
    assert result.visual_findings["regenerated_beat"] == "beat-02"

    with pytest.raises(ValueError):
        await fake.regenerate_one(INTENT, plan, script, prior, "beat-99", "x")
