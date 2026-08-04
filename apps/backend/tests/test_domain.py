import pytest
from sqlalchemy import select

from decode.db import SessionLocal
from decode.domain import canonical_hash, lock_artifact, publish_version
from decode.models import Artifact, ArtifactVersion, Project


def test_canonical_hash_is_order_independent():
    assert canonical_hash({"b": 2, "a": [1]}) == canonical_hash({"a": [1], "b": 2})


@pytest.mark.asyncio
async def test_identical_edits_still_create_immutable_versions():
    async with SessionLocal() as session:
        project = Project(title="Immutable")
        session.add(project)
        await session.flush()
        artifact = Artifact(
            project_id=project.id, artifact_type="production_brief", stable_key="default"
        )
        session.add(artifact)
        await session.flush()
        first = await publish_version(
            session, artifact, payload={"same": True}, owner_role="user", created_by="test"
        )
        second = await publish_version(
            session,
            artifact,
            payload={"same": True},
            owner_role="user",
            created_by="test",
            supersedes=first.id,
        )
        await session.commit()
        assert first.id != second.id
        assert second.sequence == 2
        assert artifact.latest_version_id == second.id
        assert len(list((await session.scalars(select(ArtifactVersion))).all())) == 2


@pytest.mark.asyncio
async def test_locked_artifact_refreshes_a_stale_identity_map():
    async with SessionLocal() as first_session:
        project = Project(title="Concurrent edit")
        first_session.add(project)
        await first_session.flush()
        artifact = Artifact(
            project_id=project.id, artifact_type="production_brief", stable_key="default"
        )
        first_session.add(artifact)
        await first_session.flush()
        initial = await publish_version(
            first_session, artifact, payload={"version": 1}, owner_role="user", created_by="test"
        )
        await first_session.commit()
        stale = await first_session.get(Artifact, artifact.id)
        assert stale is not None and stale.latest_version_id == initial.id

        async with SessionLocal() as second_session:
            current = await second_session.get(Artifact, artifact.id)
            assert current is not None
            replacement = await publish_version(
                second_session,
                current,
                payload={"version": 2},
                owner_role="user",
                created_by="test",
                supersedes=initial.id,
            )
            await second_session.commit()

        refreshed = await lock_artifact(first_session, artifact.id)
        assert refreshed is stale
        assert refreshed.latest_version_id == replacement.id
        derived = await publish_version(
            first_session,
            stale,
            payload={"version": 3},
            owner_role="producer",
            created_by="test",
            supersedes_latest=True,
        )
        assert derived.supersedes_version_id == replacement.id
        await first_session.commit()
