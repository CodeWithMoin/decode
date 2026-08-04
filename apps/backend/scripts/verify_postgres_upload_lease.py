"""Exercise source-upload lease ownership against a migrated PostgreSQL database."""

import asyncio
import hashlib

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from decode.db import SessionLocal, new_id, utcnow
from decode.main import app
from decode.models import Source
from decode.projects import router as projects_router


class PausingStore:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.objects: dict[str, bytes] = {}

    async def put(self, key, chunks, max_bytes):
        content = b"".join([chunk async for chunk in chunks])
        self.started.set()
        await self.release.wait()
        self.objects[key] = content
        return len(content), key, hashlib.sha256(content).hexdigest()

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


async def verify() -> None:
    store = PausingStore()
    projects_router.object_store = lambda _settings: store
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        project_response = await client.post(
            "/api/v1/projects",
            json={"title": "PostgreSQL upload lease verification"},
            headers={"Idempotency-Key": f"project-{new_id()}"},
        )
        assert project_response.status_code == 201, project_response.text
        project_id = project_response.json()["project_id"]
        request = asyncio.create_task(
            client.post(
                f"/api/v1/projects/{project_id}/sources",
                files={"file": ("lease.txt", b"old attempt", "text/plain")},
                data={"source_kind": "text"},
                headers={"Idempotency-Key": f"source-{new_id()}"},
            )
        )
        await store.started.wait()
        new_lease = new_id()
        new_key = f"projects/{project_id}/sources/takeover/attempts/{new_lease}/lease.txt"
        store.objects[new_key] = b"new owner bytes"
        async with SessionLocal() as session:
            source = await session.scalar(select(Source).where(Source.project_id == project_id))
            assert source is not None
            old_key = source.object_key
            source.upload_lease_id = new_lease
            source.object_key = new_key
            source.updated_at = utcnow()
            await session.commit()
        store.release.set()
        response = await request
        assert response.status_code == 409, response.text
        assert old_key not in store.objects
        assert store.objects[new_key] == b"new owner bytes"
        async with SessionLocal() as session:
            source = await session.scalar(select(Source).where(Source.project_id == project_id))
            assert source is not None
            assert source.status == "uploading"
            assert source.upload_lease_id == new_lease
            assert source.object_key == new_key
    print("postgres_upload_lease=passed")


if __name__ == "__main__":
    asyncio.run(verify())
