from __future__ import annotations

import asyncio
import hashlib
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol

from ..config import Settings


class ObjectStore(Protocol):
    async def put(
        self, key: str, chunks: AsyncIterator[bytes], max_bytes: int
    ) -> tuple[int, str, str]: ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...


class LocalObjectStore:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _resolve(self, key: str) -> Path:
        """One traversal guard for every path this store touches."""
        target = (self.root / key).resolve()
        if self.root not in target.parents:
            raise ValueError("unsafe object key")
        return target

    async def put(
        self, key: str, chunks: AsyncIterator[bytes], max_bytes: int
    ) -> tuple[int, str, str]:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        size, digest = 0, hashlib.sha256()
        try:
            with target.open("xb") as stream:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > max_bytes:
                        raise OverflowError("source too large")
                    digest.update(chunk)
                    stream.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return size, key, digest.hexdigest()

    # ponytail: whole-object read. Sources are capped at max_source_bytes and the
    # only consumer needs every byte; stream if a later artifact type outgrows that.
    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._resolve(key).read_bytes)

    async def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)


class R2ObjectStore:
    def __init__(self, settings: Settings):
        import boto3

        self.bucket = settings.r2_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
        )

    async def put(
        self, key: str, chunks: AsyncIterator[bytes], max_bytes: int
    ) -> tuple[int, str, str]:
        # Multipart upload keeps request bytes off persistent application storage.
        created = await asyncio.to_thread(
            self.client.create_multipart_upload, Bucket=self.bucket, Key=key
        )
        upload_id, parts, size, number, digest = created["UploadId"], [], 0, 1, hashlib.sha256()
        buffer = bytearray()
        try:
            async for chunk in chunks:
                size += len(chunk)
                if size > max_bytes:
                    raise OverflowError("source too large")
                digest.update(chunk)
                buffer.extend(chunk)
                if len(buffer) >= 5 * 1024 * 1024:
                    result = await asyncio.to_thread(
                        self.client.upload_part,
                        Bucket=self.bucket,
                        Key=key,
                        UploadId=upload_id,
                        PartNumber=number,
                        Body=bytes(buffer),
                    )
                    parts.append({"ETag": result["ETag"], "PartNumber": number})
                    number += 1
                    buffer.clear()
            if buffer or not parts:
                result = await asyncio.to_thread(
                    self.client.upload_part,
                    Bucket=self.bucket,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=number,
                    Body=bytes(buffer),
                )
                parts.append({"ETag": result["ETag"], "PartNumber": number})
            await asyncio.to_thread(
                self.client.complete_multipart_upload,
                Bucket=self.bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )
            return size, key, digest.hexdigest()
        except Exception:
            await asyncio.to_thread(
                self.client.abort_multipart_upload, Bucket=self.bucket, Key=key, UploadId=upload_id
            )
            raise

    async def get(self, key: str) -> bytes:
        result = await asyncio.to_thread(self.client.get_object, Bucket=self.bucket, Key=key)
        return await asyncio.to_thread(result["Body"].read)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)


def object_store(settings: Settings) -> ObjectStore:
    return (
        R2ObjectStore(settings)
        if settings.object_store == "r2"
        else LocalObjectStore(settings.local_object_root)
    )
