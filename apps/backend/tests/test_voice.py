import httpx
import pytest

from decode.config import Settings
from decode.departments.registry import voice as build_voice
from decode.departments.voice import prompt
from decode.execution.pipeline import STAGES
from decode.models import ArtifactType
from decode.providers.storage import object_store
from decode.schemas import BeatNarration, ProductionIntent, Script

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
)

SCRIPT = Script(
    rationale="Two beats, one idea each.",
    beats=[
        BeatNarration(beat_id="beat-01", narration="Attention lets a model weigh what matters."),
        BeatNarration(beat_id="beat-02", narration="The mechanism follows from that."),
    ],
)


def test_the_stage_is_discovered_from_its_manifest():
    stage = STAGES["generate_voice"]
    assert stage.produces == ArtifactType.VOICE
    assert stage.consumes == ("script", "production_intent")
    assert stage.owner_role == "writer"


def test_shipped_skills_load():
    system = prompt.SKILLS.system()
    assert "untrusted content" in system


async def test_fixture_narrator_labels_output():
    narrator = build_voice(Settings(voice="fake"))
    voice = await narrator.generate(INTENT, SCRIPT)
    assert voice.voice_findings["fixture"] is True
    assert {clip.beat_id for clip in voice.clips} == {"beat-01", "beat-02"}
    assert all(clip.duration_seconds > 0 for clip in voice.clips)


def test_unknown_provider_raises():
    with pytest.raises(ValueError):
        build_voice(Settings(voice="no_such_provider"))


FISH_SETTINGS = Settings(
    voice="fish_audio",
    fish_audio_api_key="test-key",
    fish_audio_reference_id="ref-123",
    fish_audio_model="s2.1-pro-free",
)


def _fake_post(status: int, body: bytes, calls: list[dict]):
    """Stand in for httpx.AsyncClient.post, recording each request it saw."""

    async def post(self, url, *, headers=None, json=None, **kwargs):
        calls.append({"url": url, "headers": headers, "json": json})
        return httpx.Response(status, content=body, request=httpx.Request("POST", url))

    return post


def test_fish_audio_requires_credentials():
    with pytest.raises(ValueError):
        build_voice(Settings(voice="fish_audio"))


async def test_fish_audio_synthesizes_and_stores_each_beat(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(httpx.AsyncClient, "post", _fake_post(200, b"ID3-fake-mp3", calls))

    narrator = build_voice(FISH_SETTINGS)
    voice = await narrator.generate(INTENT, SCRIPT)

    # One real TTS request per beat, shaped the way Fish Audio expects.
    assert [call["url"] for call in calls] == ["https://api.fish.audio/v1/tts"] * 2
    assert all(call["headers"]["Authorization"] == "Bearer test-key" for call in calls)
    assert all(call["headers"]["model"] == "s2.1-pro-free" for call in calls)
    assert [call["json"]["text"] for call in calls] == [
        "Attention lets a model weigh what matters.",
        "The mechanism follows from that.",
    ]
    assert all(call["json"] == {**call["json"], "reference_id": "ref-123", "format": "mp3"}
               for call in calls)

    # The bytes the provider returned are what actually landed in the store.
    assert voice.voice_findings == {
        "fixture": False,
        "provider": "fish_audio",
        "reference_id": "ref-123",
        "model": "s2.1-pro-free",
        "skills_version": prompt.SKILLS.version,
    }
    assert {clip.beat_id for clip in voice.clips} == {"beat-01", "beat-02"}
    store = object_store(FISH_SETTINGS)
    for clip in voice.clips:
        assert clip.duration_seconds > 0
        assert await store.get(clip.audio_key) == b"ID3-fake-mp3"


async def test_fish_audio_propagates_provider_failure(monkeypatch):
    monkeypatch.setattr(httpx.AsyncClient, "post", _fake_post(500, b"upstream boom", []))

    narrator = build_voice(FISH_SETTINGS)
    # A provider error must surface so the worker fails the run retryably rather
    # than storing a broken clip and reporting success.
    with pytest.raises(httpx.HTTPStatusError):
        await narrator.generate(INTENT, SCRIPT)


async def test_voice_endpoint_is_seekable(client):
    """The Remotion player seeks narration audio, so the clip route must honour
    Range requests — a plain 200 is non-seekable and errors the player."""
    from decode.config import get_settings
    from decode.providers.storage import object_store

    store = object_store(get_settings())
    key, body = "narration/seek-test.mp3", b"0123456789" * 5  # 50 bytes

    async def chunks():
        yield body

    await store.put(key, chunks(), max_bytes=1024)

    full = await client.get(f"/api/v1/voice/{key}")
    assert full.status_code == 200
    assert full.headers["accept-ranges"] == "bytes"
    assert full.content == body

    part = await client.get(f"/api/v1/voice/{key}", headers={"Range": "bytes=10-19"})
    assert part.status_code == 206
    assert part.headers["content-range"] == f"bytes 10-19/{len(body)}"
    assert part.content == body[10:20]

    tail = await client.get(f"/api/v1/voice/{key}", headers={"Range": "bytes=40-"})
    assert tail.status_code == 206 and tail.content == body[40:]

    unsatisfiable = await client.get(f"/api/v1/voice/{key}", headers={"Range": "bytes=999-"})
    assert unsatisfiable.status_code == 416
