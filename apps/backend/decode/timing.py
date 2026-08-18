"""Sub-scene timing: narration is the authority, events resolve *to* it.

ADR-005 makes a scene's *duration* the measured narration length. This extends
the same rule from the scene down to the events *inside* it. A visual or sound
event names a semantic **anchor** ("attention_weight_reveal") that resolves to a
timestamp against the current narration, instead of hard-coding `3.42`. Change the
narration and the same anchors resolve to new times — nothing downstream is
hand-fixed. That resilience is the whole reason the model is anchor-first.

This module is deliberately storage-agnostic: it defines how narration + anchors
turn into resolved times, not where a scene's timeline is persisted. It plugs into
the current artifact payloads today and the project snapshot later without change.

Kept minimal on purpose (no TimelineEvent / AudioAsset entities): a word list, an
anchor, and a resolver. Sound and music events are just anchors with a payload,
added when the Sound Designer lands.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


def _q3(value: float) -> float:
    """Quantize to ms. Times derive from measured audio and float math; pinning
    the precision keeps a resolved anchor stable across re-resolves and hosts."""
    return round(value, 3)


class Word(BaseModel):
    """One spoken word and when it lands, in seconds from the scene's start."""

    text: str = Field(min_length=1)
    start: float = Field(ge=0)
    end: float = Field(ge=0)


def even_split_words(text: str, duration: float) -> list[Word]:
    """Deterministic word timings spread evenly across the duration.

    An **estimate**, not measured alignment — every word gets an equal slice. Real
    speech does not land on even intervals, so this is for the fixture narrator and
    as a last-resort fallback, never presented as a real read. Real timings come
    from the TTS provider's alignment or a forced-alignment pass.
    """
    tokens = [token for token in text.split() if token.strip()]
    if not tokens or duration <= 0:
        return []
    span = duration / len(tokens)
    return [
        Word(text=token, start=_q3(index * span), end=_q3((index + 1) * span))
        for index, token in enumerate(tokens)
    ]


class NarrationTiming(BaseModel):
    """The transcript of one scene's narration, timed. The timing authority.

    `words` come from the TTS provider's alignment or a forced-alignment pass; a
    fake can produce evenly-spaced ones for tests. `duration` is the measured clip
    length (ADR-005) and is the fallback the resolver scales `progress` anchors by.
    """

    duration: float = Field(gt=0)
    words: list[Word] = Field(default_factory=list)

    def find_phrase(self, phrase: str) -> tuple[float, float] | None:
        """Locate a run of consecutive words, returning (start, end) or None.

        Case- and punctuation-insensitive on word text, so "attention weight"
        matches `... attention weight.` The first match wins — narration rarely
        repeats a keyed phrase, and if it does the earliest occurrence is the one
        a creator means by naming it.
        """
        target = [_norm(w) for w in phrase.split() if w.strip()]
        if not target:
            return None
        norms = [_norm(w.text) for w in self.words]
        for i in range(len(norms) - len(target) + 1):
            if norms[i : i + len(target)] == target:
                return (self.words[i].start, self.words[i + len(target) - 1].end)
        return None


AnchorKind = Literal["phrase", "progress", "time"]
PhraseAlign = Literal["start", "end", "mid"]


class Anchor(BaseModel):
    """A named point in a scene that resolves to a time.

    - `phrase`: bound to words in the narration ("largest attention weight"). The
      resilient kind — it follows the narration when the script changes.
    - `progress`: a fraction 0..1 of the scene duration. For events with no spoken
      hook (an ambient fade), still narration-relative because duration is.
    - `time`: an absolute offset in seconds. The escape hatch; a human "pin this
      exactly here" that no longer follows the narration.
    """

    name: str = Field(min_length=1)
    kind: AnchorKind
    phrase: str | None = None
    align: PhraseAlign = "start"
    at: float | None = None


class UnresolvedAnchor(BaseModel):
    """Why an anchor produced no time — surfaced, never silently dropped."""

    name: str
    reason: str


class ResolvedTimeline(BaseModel):
    """Anchor name → resolved seconds, plus the ones that could not resolve."""

    times: dict[str, float] = Field(default_factory=dict)
    unresolved: list[UnresolvedAnchor] = Field(default_factory=list)


def _norm(word: str) -> str:
    return "".join(ch for ch in word.lower() if ch.isalnum())


def resolve_anchor(anchor: Anchor, timing: NarrationTiming) -> float | None:
    """Resolve one anchor against the current narration, or None if it can't.

    A `phrase` anchor whose words are not in the narration returns None rather
    than guessing a time — the caller records it as unresolved so a creator sees
    "this beat has nothing to attach to" instead of a wrong beat firing at 0s.
    """
    if anchor.kind == "time":
        if anchor.at is None:
            return None
        return _q3(min(max(anchor.at, 0.0), timing.duration))
    if anchor.kind == "progress":
        if anchor.at is None:
            return None
        return _q3(min(max(anchor.at, 0.0), 1.0) * timing.duration)
    # phrase
    if not anchor.phrase:
        return None
    span = timing.find_phrase(anchor.phrase)
    if span is None:
        return None
    start, end = span
    if anchor.align == "end":
        return _q3(end)
    if anchor.align == "mid":
        return _q3((start + end) / 2)
    return _q3(start)


def resolve_beats(anchors: list[Anchor], timing: NarrationTiming) -> ResolvedTimeline:
    """Resolve every anchor against the current narration.

    This is the function a scene re-runs after its narration changes: same anchors
    in, new times out. Downstream visual/sound beats read `times[name]`; they store
    no absolute seconds of their own, which is what makes a one-sentence edit
    ripple through timing without anyone fixing numbers by hand.
    """
    timeline = ResolvedTimeline()
    for anchor in anchors:
        resolved = resolve_anchor(anchor, timing)
        if resolved is None:
            timeline.unresolved.append(
                UnresolvedAnchor(
                    name=anchor.name,
                    reason=(
                        f"phrase {anchor.phrase!r} is not in the narration"
                        if anchor.kind == "phrase"
                        else f"{anchor.kind} anchor has no value"
                    ),
                )
            )
            continue
        timeline.times[anchor.name] = resolved
    return timeline
