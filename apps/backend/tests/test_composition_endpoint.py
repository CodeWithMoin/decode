"""The composition endpoint resolves a scene's beats against its narration and
stamps the composition for playback (VISUALIZER-TO-HYPERFRAMES slice 3)."""

from decode.db import SessionLocal
from decode.models import Artifact, ArtifactType, ArtifactVersion
from decode.schemas import SceneModule, SceneVisuals, VisualBeat, Voice, VoiceNarration
from decode.timing import Anchor, even_split_words

TEMPLATE = (
    '<div id="root" data-composition-id="main" data-start="0" '
    'data-duration="{{SCENE_DURATION}}" data-width="1920" data-height="1080">'
    '<div id="label" class="clip" data-start="0" data-duration="{{SCENE_DURATION}}" '
    'data-track-index="1">Hi</div></div>\n<!-- decode:timing -->\n'
    "<script>window.__timelines={};</script>"
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


async def _project(client) -> str:
    response = await client.post(
        "/api/v1/projects", json={"title": "T"}, headers={"Idempotency-Key": "comp-p1"}
    )
    return response.json()["project_id"]


async def test_composition_is_resolved_and_stamped_for_playback(client):
    pid = await _project(client)
    scene = SceneModule(
        beat_id="beat-01",
        controls=[],
        composition_html=TEMPLATE,
        beats=[VisualBeat(name="reveal", anchor=Anchor(name="reveal", kind="progress", at=0.0))],
    )
    await _seed(
        pid,
        ArtifactType.SCENE_VISUALS,
        SceneVisuals(rationale="r", scenes=[scene]).model_dump(),
    )
    await _seed(
        pid,
        ArtifactType.VOICE,
        Voice(
            rationale="r",
            clips=[
                VoiceNarration(
                    beat_id="beat-01",
                    audio_key="k",
                    duration_seconds=4.0,
                    words=even_split_words("self attention weighs every token", 4.0),
                )
            ],
        ).model_dump(),
    )

    response = await client.get(f"/api/v1/projects/{pid}/scene-visuals/beat-01/composition")
    assert response.status_code == 200
    body = response.json()
    assert body["duration"] == 4.0
    assert "{{SCENE_DURATION}}" not in body["html"]  # duration stamped
    assert 'data-duration="4"' in body["html"]
    assert "window.__decodeTiming" in body["html"]  # timing injected
    assert body["beats"][0]["beat"] == "reveal"


async def test_missing_scene_visuals_is_404(client):
    pid = await _project(client)
    response = await client.get(f"/api/v1/projects/{pid}/scene-visuals/beat-01/composition")
    assert response.status_code == 404


async def test_a_react_scene_has_no_composition_to_stamp(client):
    pid = await _project(client)
    await _seed(
        pid,
        ArtifactType.SCENE_VISUALS,
        SceneVisuals(
            rationale="r",
            scenes=[SceneModule(beat_id="beat-01", controls=[], component_source="X")],
        ).model_dump(),
    )
    response = await client.get(f"/api/v1/projects/{pid}/scene-visuals/beat-01/composition")
    assert response.status_code == 409


async def test_composition_without_narration_is_not_ready(client):
    pid = await _project(client)
    scene = SceneModule(
        beat_id="beat-01",
        controls=[],
        composition_html=TEMPLATE,
        beats=[VisualBeat(name="reveal", anchor=Anchor(name="reveal", kind="progress", at=0.0))],
    )
    await _seed(
        pid,
        ArtifactType.SCENE_VISUALS,
        SceneVisuals(rationale="r", scenes=[scene]).model_dump(),
    )
    response = await client.get(f"/api/v1/projects/{pid}/scene-visuals/beat-01/composition")
    assert response.status_code == 409  # narration not ready
