"""Which department actually runs.

One place that maps configuration to an implementation, so the worker never
learns a provider name and a department never learns how it was selected.

Settings are named for departments, not crew roles: `DECODE_INTAKE`, not
`DECODE_PRODUCER`. Five crew names cannot address eight departments — the
Visualizer and the Renderer both present as Motion Designer — so the crew
role a department wears is declared in its SKILL.md instead.
"""

from __future__ import annotations

from ..config import Settings
from .contracts import Architect, Author, Evaluator, Intake, Narrator, Visualizer
from .fixtures import (
    FakeArchitect,
    FakeAuthor,
    FakeEvaluator,
    FakeIntake,
    FakeNarrator,
    FakeVisualizer,
)


def intake(settings: Settings) -> Intake:
    # An unknown name raises rather than falling back: silently publishing a
    # fixture brief while the operator believes real Intake ran would put a
    # "fixture: false" label on output nothing analyzed.
    if settings.intake == "fake":
        return FakeIntake()
    if settings.intake == "openai":
        # Imported here so the fixture path never needs the openai package.
        from .intake import build as build_intake

        return build_intake(settings)
    raise ValueError(f"unknown intake provider: {settings.intake!r}")


def architect(settings: Settings) -> Architect:
    if settings.architect == "fake":
        return FakeArchitect()
    if settings.architect == "openai":
        from .architect import build as build_architect

        return build_architect(settings)
    raise ValueError(f"unknown architect provider: {settings.architect!r}")


def author(settings: Settings) -> Author:
    if settings.author == "fake":
        return FakeAuthor()
    if settings.author == "openai":
        from .author import build as build_author

        return build_author(settings)
    raise ValueError(f"unknown author provider: {settings.author!r}")


def visualizer(settings: Settings) -> Visualizer:
    if settings.visualizer == "fake":
        return FakeVisualizer()
    if settings.visualizer == "openai":
        from .visualizer import build as build_visualizer

        return build_visualizer(settings)
    raise ValueError(f"unknown visualizer provider: {settings.visualizer!r}")


def voice(settings: Settings) -> Narrator:
    if settings.voice == "fake":
        return FakeNarrator()
    if settings.voice == "fish_audio":
        from .voice import build as build_voice

        return build_voice(settings)
    raise ValueError(f"unknown voice provider: {settings.voice!r}")


def evaluator(settings: Settings) -> Evaluator:
    if settings.evaluator == "fake":
        return FakeEvaluator()
    if settings.evaluator == "openai":
        from .evaluator import build as build_evaluator

        return build_evaluator(settings)
    raise ValueError(f"unknown evaluator provider: {settings.evaluator!r}")
