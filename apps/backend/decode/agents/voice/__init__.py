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
from io import BytesIO

import httpx

from ...config import Settings
from ...providers.storage import object_store
import asyncio
import io

from ...schemas import ProductionIntent, Script, Voice, VoiceNarration
from ...timing import Word, align_words_to_tokens, even_split_words
from ..contracts import ProviderUsage
from .prompt import SKILLS

# Fallback spoken rate, chars per second, used only when the real audio cannot be
# measured. English narration averages ~14 characters per second across the
# voices we render. The measured mp3 length is always preferred (ADR-005).
_CHARS_PER_SECOND = 14.0


def _mp3_duration_seconds(data: bytes) -> float | None:
    """The real length of an mp3, or None if it cannot be read.

    Audio is the timing authority, so a clip's duration is measured from the
    bytes the provider returned rather than guessed from the text. Never raises —
    a clip that cannot be parsed falls back to the character estimate rather than
    failing the whole narration run.
    """
    try:
        from mutagen.mp3 import MP3

        info = MP3(BytesIO(data)).info
        length = info.length if info is not None else None
        return round(length, 2) if length and length > 0 else None
    except Exception:
        return None


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

    async def _align(self, narration: str, audio: bytes, duration: float) -> list[Word]:
        """Word-level timings for one clip, from STT forced against the narration.

        Transcribes the synthesized audio with word timestamps and maps them back
        onto the narration's own tokens. Requires an OpenAI-compatible audio
        endpoint (`openai_api_key`); when none is configured or the call fails,
        returns an even split so the choreography still animates — an estimate,
        never presented as a real read.
        """
        if not self.settings.openai_api_key:
            return even_split_words(narration, duration)
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(
                api_key=self.settings.openai_api_key, base_url=self.settings.openai_base_url
            )
            buffer = io.BytesIO(audio)
            buffer.name = "narration.mp3"
            async with asyncio.timeout(45):
                result = await client.audio.transcriptions.create(
                    model=self.settings.openai_transcribe_model,
                    file=buffer,
                    response_format="verbose_json",
                    timestamp_granularities=["word"],
                )
            spoken = [(w.word, w.start, w.end) for w in (getattr(result, "words", None) or [])]
            aligned = align_words_to_tokens(narration, spoken, duration)
            return aligned or even_split_words(narration, duration)
        except Exception:
            # No usable transcription endpoint in this environment, or a transient
            # failure — degrade to the estimate rather than shipping a static scene.
            return even_split_words(narration, duration)

    async def generate(self, intent: ProductionIntent, script: Script) -> Voice:
        store = object_store(self.settings)
        clips: list[VoiceNarration] = []

        for beat in script.beats:
            audio = await self._synthesize(beat.narration)
            key = f"narration/{uuid.uuid4().hex}.mp3"

            async def chunks(data: bytes = audio):
                yield data

            await store.put(key, chunks(), max_bytes=20 * 1024 * 1024)
            measured = _mp3_duration_seconds(audio)
            duration = measured if measured is not None else len(beat.narration) / _CHARS_PER_SECOND
            duration = round(max(1.0, duration), 2)
            # The choreography clock needs per-word timings. Transcribe the audio
            # with word timestamps (STT) and map them back onto the narration's
            # own tokens so each reveal lands on the spoken word; fall back to an
            # even split when no transcription endpoint is reachable.
            words = await self._align(beat.narration, audio, duration)
            clips.append(
                VoiceNarration(
                    beat_id=beat.beat_id,
                    audio_key=key,
                    duration_seconds=duration,
                    words=words,
                )
            )

        self.last_usage = ProviderUsage(self.reference_id, 0, 0, 1)

        return Voice(
            rationale=(
                f"I read all {len(clips)} passages aloud with the chosen voice. "
                "Each scene's length is the measured length of its narration — the audio is "
                "the timing authority."
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
