"""The Voice department — the Writer's narration, read aloud.

It reads an approved Script and produces one audio clip per beat, spoken by a
Fish Audio voice. The department is a TTS adapter rather than an LLM: it does not
reason about the words, it renders them.

Audio is stored in the object store under `voice/<uuid>.mp3` and referenced by
key from the artifact payload, so the artifact stays small while the bytes stay
durable and fetchable by the preview and the renderer.
"""

from __future__ import annotations

import uuid

import httpx

from ...config import Settings
from ...providers.storage import object_store
from ...schemas import ProductionIntent, Script, Voice, VoiceNarration
from ..contracts import ProviderUsage
from .prompt import SKILLS

# Rough spoken rate, chars per second, used only to estimate clip duration when
# the provider does not report one. English narration averages ~14 characters
# per second across the voices we render.
_CHARS_PER_SECOND = 14.0


class FishAudioNarrator:
    identifier = f"voice/{SKILLS.version}"

    def __init__(self, settings: Settings):
        if not settings.fish_audio_api_key:
            raise ValueError("DECODE_FISH_AUDIO_API_KEY is required when DECODE_VOICE=fish_audio")
        if not settings.fish_audio_reference_id:
            raise ValueError(
                "DECODE_FISH_AUDIO_REFERENCE_ID is required when DECODE_VOICE=fish_audio"
            )
        self.settings = settings
        self.base_url = settings.fish_audio_base_url.rstrip("/")
        self.reference_id = settings.fish_audio_reference_id
        self.model = settings.fish_audio_model
        self.last_usage: ProviderUsage | None = None

    async def _synthesize(self, text: str) -> bytes:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/v1/tts",
                headers={
                    "Authorization": f"Bearer {self.settings.fish_audio_api_key}",
                    # Fish Audio selects the TTS backbone from this header, not the
                    # body; without it the API falls back to an older default model.
                    "model": self.model,
                },
                json={
                    "text": text,
                    "reference_id": self.reference_id,
                    "format": "mp3",
                },
            )
            response.raise_for_status()
            return response.content

    async def generate(self, intent: ProductionIntent, script: Script) -> Voice:
        store = object_store(self.settings)
        clips: list[VoiceNarration] = []

        for beat in script.beats:
            audio = await self._synthesize(beat.narration)
            key = f"narration/{uuid.uuid4().hex}.mp3"

            async def chunks(data: bytes = audio):
                yield data

            await store.put(key, chunks(), max_bytes=20 * 1024 * 1024)
            duration = max(1.0, len(beat.narration) / _CHARS_PER_SECOND)
            clips.append(
                VoiceNarration(
                    beat_id=beat.beat_id,
                    audio_key=key,
                    duration_seconds=round(duration, 2),
                )
            )

        self.last_usage = ProviderUsage(self.reference_id, 0, 0, 1)

        return Voice(
            rationale=(
                f"I read all {len(clips)} passages aloud with the chosen voice. "
                "Durations are estimated from the words; the timeline is the authority."
            ),
            clips=clips,
            voice_findings={
                "fixture": False,
                "provider": "fish_audio",
                "reference_id": self.reference_id,
                "model": self.model,
                "skills_version": SKILLS.version,
            },
        )


def build(settings: Settings) -> FishAudioNarrator:
    return FishAudioNarrator(settings)
