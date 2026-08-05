"""The Producer department contract and its deterministic walking-skeleton adapter.

The port exists so a real model adapter can replace the fake without touching
routes, artifact schemas, lineage, or job semantics — the exit criterion the
backend foundation plan sets for the walking skeleton.

`SourceInput` is what the contract declares a Producer may see: the source
metadata plus a way to read the bytes. Nothing else about the project crosses
this boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..config import Settings
from ..schemas import ProductionBrief, ProductionIntent
from .storage import ObjectStore, object_store


@dataclass(frozen=True)
class SourceInput:
    object_key: str
    filename: str
    media_type: str
    size_bytes: int
    sha256: str

    @classmethod
    def from_manifest(cls, manifest: dict) -> SourceInput:
        return cls(
            object_key=manifest["object_key"],
            filename=manifest.get("filename", ""),
            media_type=manifest.get("media_type", "application/octet-stream"),
            size_bytes=manifest.get("size_bytes", 0),
            sha256=manifest.get("sha256", ""),
        )


class Producer(Protocol):
    """Turns sources plus production intent into a Production Brief."""

    identifier: str

    async def generate(
        self, intent: ProductionIntent, sources: list[SourceInput]
    ) -> ProductionBrief: ...


class Evaluator(Protocol):
    """Records structured checks. It never revises and never gates approval."""

    identifier: str

    def evaluate(self, brief: ProductionBrief) -> tuple[str, list[dict], str]: ...


class FakeProducer:
    identifier = "fixture-producer-v1"

    def __init__(self, store: ObjectStore | None = None):
        # Deterministic output needs no bytes; the parameter keeps construction
        # identical to a real adapter's.
        self.store = store

    async def generate(
        self, intent: ProductionIntent, sources: list[SourceInput]
    ) -> ProductionBrief:
        direction = (
            f" based on your direction: {intent.creative_brief}"
            if intent.creative_brief
            else ""
        )
        return ProductionBrief(
            title="Production Brief",
            summary=f"A sample educational treatment for {intent.audience}{direction}.",
            audience_profile=intent.audience,
            learning_objectives=[
                "Explain the source's central idea",
                "Connect the idea to a practical example",
            ],
            key_concepts=[
                {"name": "Central idea", "importance": "core"},
                {"name": "Practical context", "importance": "supporting"},
            ],
            prerequisites=["No specialist knowledge assumed"],
            scope_in=["Conceptual explanation", "One worked example"],
            scope_out=["Production-ready scene design", "Narration and rendering"],
            teaching_opportunities=[
                {
                    "title": "Concrete analogy",
                    "rationale": "Ground the central idea in a familiar situation.",
                }
            ],
            source_findings={
                "fixture": True,
                "source_count": len(sources),
                "total_bytes": sum(item.size_bytes for item in sources),
                "note": (
                    "Metadata-only deterministic walking-skeleton findings; "
                    "no extraction was performed."
                ),
            },
            open_questions=[],
        )


class FakeEvaluator:
    identifier = "fixture-evaluator-v1"

    def evaluate(self, brief: ProductionBrief) -> tuple[str, list[dict], str]:
        checks = [
            {
                "name": "objectives_present",
                "outcome": "pass" if brief.learning_objectives else "fail",
                "evidence": "Learning objectives are present.",
            },
            {
                "name": "concepts_present",
                "outcome": "pass" if brief.key_concepts else "fail",
                "evidence": "Key concepts are present.",
            },
            {
                "name": "fixture_disclosed",
                "outcome": "pass" if brief.source_findings.get("fixture") is True else "fail",
                "evidence": "Fixture findings are explicitly labeled.",
            },
        ]
        decision = (
            "pass" if all(item["outcome"] == "pass" for item in checks) else "needs_attention"
        )
        return (
            decision,
            checks,
            "Structured fixture checks completed; human approval remains independent.",
        )


def producer(settings: Settings) -> Producer:
    # An unknown name raises rather than falling back: silently publishing a
    # fixture brief while the operator believes a real Producer ran would put a
    # "fixture: false" label on output nothing analyzed.
    if settings.producer == "fake":
        return FakeProducer(object_store(settings))
    raise ValueError(f"unknown producer provider: {settings.producer!r}")


def evaluator(settings: Settings) -> Evaluator:
    if settings.evaluator == "fake":
        return FakeEvaluator()
    raise ValueError(f"unknown evaluator provider: {settings.evaluator!r}")
