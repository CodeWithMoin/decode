"""Serve generated narration audio from the object store."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from .config import get_settings
from .providers.storage import object_store

router = APIRouter(tags=["voice"])


@router.get("/voice/{key:path}")
async def voice_audio(key: str, request: Request):
    """Serve one narration clip, honouring HTTP Range requests.

    The Remotion player seeks the audio to keep the timeline in step, and a
    plain 200 with the whole body is not seekable — the player errors. So this
    advertises `Accept-Ranges` and answers a `Range` header with `206`.

    ponytail: reads the whole object then slices. Narration clips are small and
    the store's get() is whole-object anyway; stream from the store if a clip
    ever outgrows memory.
    """
    try:
        data = await object_store(get_settings()).get(key)
    except Exception:
        return Response(status_code=404)

    total = len(data)
    base = {"Accept-Ranges": "bytes"}
    range_header = request.headers.get("range")
    if not range_header:
        return Response(content=data, media_type="audio/mpeg", headers=base)

    # "bytes=start-end"; players send "bytes=0-" first. Anything we don't
    # understand (multi-range, other units) falls back to the full body.
    unit, _, spec = range_header.partition("=")
    if unit.strip().lower() != "bytes" or "," in spec:
        return Response(content=data, media_type="audio/mpeg", headers=base)

    start_s, _, end_s = spec.strip().partition("-")
    try:
        if start_s == "":  # suffix: bytes=-N → last N bytes
            start, end = max(0, total - int(end_s)), total - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else total - 1
    except ValueError:
        return Response(content=data, media_type="audio/mpeg", headers=base)

    if start >= total or start > end:
        return Response(status_code=416, headers={**base, "Content-Range": f"bytes */{total}"})

    end = min(end, total - 1)
    chunk = data[start : end + 1]
    return Response(
        content=chunk,
        status_code=206,
        media_type="audio/mpeg",
        headers={**base, "Content-Range": f"bytes {start}-{end}/{total}"},
    )
