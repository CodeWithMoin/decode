"""HyperFrames export: resolve+stamp each scene server-side, and the pure
render/stitch helpers (VISUALIZER-TO-HYPERFRAMES slice 4). The subprocess render
itself needs the HyperFrames CLI + ffmpeg and is exercised at runtime."""

from pathlib import Path

from decode.config import get_settings
from decode.db import SessionLocal
from decode.models import Artifact, ArtifactType, ArtifactVersion
from decode.renders.hyperframes import (
    concat_args,
    concat_list,
    mux_args,
    prepare_scenes,
    render_args,
    scaffold,
)
from decode.schemas import SceneModule, SceneVisuals, VisualBeat, Voice, VoiceNarration
from decode.timing import Anchor, even_split_words

TEMPLATE = (
    '<div id="root" data-composition-id="main" data-start="0" '
    'data-duration="{{SCENE_DURATION}}" data-width="1920" data-height="1080"></div>'
    "\n<!-- decode:timing -->\n<script>window.__timelines={};</script>"
)


async def _seed(project_id: str, artifact_type: ArtifactType, payload: dict) -> None:
    async with SessionLocal() as session:
        artifact = Artifact(
            project_id=project_id, artifact_type=artifact_type, stable_key="default"
        )
        session.add(artifact)
        await session.flush()
        version = ArtifactVersion(
            artifact_id=artifact.id,
            sequence=1,
            schema_version=1,
            payload=payload,
            content_hash="0" * 64,
            owner_role="motion_designer",
            created_by="test",
        )
        session.add(version)
        await session.flush()
        artifact.latest_version_id = version.id
        await session.commit()


# --- pure helpers --------------------------------------------------------------


def test_scaffold_writes_a_renderable_project(tmp_path):
    scaffold(tmp_path / "p", "<html>x</html>")
    assert (tmp_path / "p" / "index.html").read_text() == "<html>x</html>"
    assert (tmp_path / "p" / "hyperframes.json").exists()


def test_concat_list_is_one_file_line_per_clip():
    assert concat_list([Path("/a.mp4"), Path("/b.mp4")]) == "file '/a.mp4'\nfile '/b.mp4'\n"


def test_render_args_target_the_project_and_output():
    args = render_args(Path("/p"), Path("/o.mp4"), "npx", 24)
    assert args[:3] == ["npx", "hyperframes", "render"]
    assert "/p" in args and "/o.mp4" in args and "24" in args


def test_stitch_helpers_shell_out_to_ffmpeg():
    assert mux_args(Path("/v"), Path("/a"), Path("/o"))[0] == "ffmpeg"
    assert concat_args(Path("/l"), Path("/o"))[0] == "ffmpeg"


# --- server-side preparation ---------------------------------------------------


async def test_prepare_resolves_and_stamps_every_hyperframes_scene():
    pid = "proj-hf"
    scene = SceneModule(
        beat_id="beat-01",
        controls=[],
        composition_html=TEMPLATE,
        beats=[VisualBeat(name="reveal", anchor=Anchor(name="reveal", kind="progress", at=0.0))],
    )
    await _seed(
        pid, ArtifactType.SCENE_VISUALS, SceneVisuals(rationale="r", scenes=[scene]).model_dump()
    )
    await _seed(
        pid,
        ArtifactType.VOICE,
        Voice(
            rationale="r",
            clips=[
                VoiceNarration(
                    beat_id="beat-01",
                    audio_key="missing-key",  # absent in the store → audio None, still prepares
                    duration_seconds=4.0,
                    words=even_split_words("self attention weighs every token", 4.0),
                )
            ],
        ).model_dump(),
    )

    async with SessionLocal() as session:
        prepared = await prepare_scenes(session, pid, get_settings())

    assert prepared is not None
    assert len(prepared) == 1
    assert prepared[0].duration == 4.0
    assert "{{SCENE_DURATION}}" not in prepared[0].html  # stamped
    assert 'data-duration="4"' in prepared[0].html


async def test_a_react_cut_is_not_a_hyperframes_render():
    pid = "proj-react"
    await _seed(
        pid,
        ArtifactType.SCENE_VISUALS,
        SceneVisuals(
            rationale="r",
            scenes=[SceneModule(beat_id="beat-01", controls=[], component_source="X")],
        ).model_dump(),
    )
    async with SessionLocal() as session:
        prepared = await prepare_scenes(session, pid, get_settings())
    assert prepared is None  # falls through to the Remotion path
