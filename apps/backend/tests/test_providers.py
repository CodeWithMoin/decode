import pytest

from decode.agents import SourceInput
from decode.agents.registry import evaluator, intake
from decode.config import Settings
from decode.providers.storage import LocalObjectStore


async def stream(payload: bytes):
    yield payload


async def test_local_store_round_trip(tmp_path):
    store = LocalObjectStore(tmp_path)
    await store.put("sources/a.pdf", stream(b"%PDF-1.7 hello"), max_bytes=1024)
    assert await store.get("sources/a.pdf") == b"%PDF-1.7 hello"


async def test_local_store_rejects_traversal(tmp_path):
    store = LocalObjectStore(tmp_path)
    with pytest.raises(ValueError):
        await store.get("../escape")


async def test_fake_intake_reports_sources_and_discloses_fixture(tmp_path):
    from decode.schemas import ProductionIntent

    settings = Settings(local_object_root=tmp_path)
    brief = await intake(settings).generate(
        ProductionIntent(
            audience="Beginners",
            runtime_mode="deep_dive",
            depth="balanced",
            narration_style="friendly",
        ),
        [
            SourceInput.from_manifest(
                {
                    "object_key": "sources/a.pdf",
                    "filename": "a.pdf",
                    "media_type": "application/pdf",
                    "size_bytes": 40,
                    "sha256": "abc",
                }
            )
        ],
    )
    assert brief.source_findings["fixture"] is True
    assert brief.source_findings["source_count"] == 1
    assert brief.source_findings["total_bytes"] == 40


def test_unknown_provider_raises_rather_than_falling_back(tmp_path):
    # A silent fallback would publish a fixture brief labelled as real work.
    with pytest.raises(ValueError):
        intake(Settings(intake="anthropic", local_object_root=tmp_path))
    with pytest.raises(ValueError):
        evaluator(Settings(evaluator="anthropic"))
