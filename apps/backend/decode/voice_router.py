"""Serve generated narration audio from the object store."""

from __future__ import annotations

from fastapi import APIRouter, Response

from .config import get_settings
from .providers.storage import object_store

router = APIRouter(tags=["voice"])


@router.get("/voice/{key:path}")
async def voice_audio(key: str):
    """Stream one narration clip by its object key."""
    try:
        data = await object_store(get_settings()).get(key)
    except Exception:
        return Response(status_code=404)
    return Response(content=data, media_type="audio/mpeg")
