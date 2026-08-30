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


def _norm(token: str) -> str:
    """Compare tokens ignoring case and punctuation ("high," == "high")."""
    return "".join(ch for ch in token.lower() if ch.isalnum())


def align_words_to_tokens(
    text: str, stt_words: list[tuple[str, float, float]], duration: float
) -> list[Word]:
    """Map STT word timestamps onto the narration's OWN tokens.

    The choreography anchors verbs to `atWordIndex` — an index into the narration
    tokenised by whitespace. An STT transcript has its own tokenisation (dropped
    filler, split contractions), so we can't use its indices directly. We align
    the two token streams (difflib), pin each matched narration token to its
    spoken time, then interpolate the unmatched tokens between anchors. The result
    has exactly one Word per narration token, in order — indices stay valid, and
    each reveal lands on when its word is actually spoken.

    Falls back to an even split when there are no usable anchors.
    """
    import difflib

    tokens = [t for t in text.split() if t.strip()]
    if not tokens or duration <= 0:
        return []
    usable = [(w, float(s), float(e)) for (w, s, e) in stt_words if _norm(w)]
    if not usable:
        return even_split_words(text, duration)

    matcher = difflib.SequenceMatcher(
        None, [_norm(t) for t in tokens], [_norm(w) for w, _, _ in usable], autojunk=False
    )
    starts: list[float | None] = [None] * len(tokens)
    for i, j, n in matcher.get_matching_blocks():
        for k in range(n):
            starts[i + k] = usable[j + k][1]
    if all(s is None for s in starts):
        return even_split_words(text, duration)

    # Interpolate gaps between anchors; extend to 0 at the head and `duration` at
    # the tail so every token gets a monotonic start time.
    anchors = [(idx, s) for idx, s in enumerate(starts) if s is not None]
    if anchors[0][0] != 0:
        anchors.insert(0, (0, 0.0))
    if anchors[-1][0] != len(tokens) - 1:
        anchors.append((len(tokens) - 1, duration))
    filled = [0.0] * len(tokens)
    for (i0, t0), (i1, t1) in zip(anchors, anchors[1:], strict=False):
        filled[i0] = t0
        for idx in range(i0 + 1, i1 + 1):
            frac = (idx - i0) / (i1 - i0) if i1 > i0 else 1.0
            filled[idx] = t0 + (t1 - t0) * frac
    # Enforce monotonic non-decreasing, clamp to [0, duration].
    for idx in range(1, len(filled)):
        filled[idx] = min(duration, max(filled[idx], filled[idx - 1]))
    return [
        Word(
            text=token,
            start=_q3(filled[idx]),
            end=_q3(filled[idx + 1] if idx + 1 < len(tokens) else duration),
        )
        for idx, token in enumerate(tokens)
    ]


class NarrationTiming(BaseModel):
    """The transcript of one scene's narration, timed. The timing authority.

    `words` come from the TTS provider's alignment or a forced-alignment pass; a
    fake can produce evenly-spaced ones for tests. `duration` is the measured clip
    length (ADR-005) and is the fallback the resolver scales `progress` anchors by.
    """

    duration: float = Field(gt=0)
    words: list[Word] = Field(default_factory=list)

    def find_phrase(self, phrase: str, occurrence: int = 1) -> tuple[float, float] | None:
        """Locate a run of consecutive words, returning (start, end) or None.

        Case- and punctuation-insensitive on word text, so "attention weight"
        matches `... attention weight.` `occurrence` is one-based so a storyboard
        can disambiguate repeated phrases without falling back to a word index.
        """
        target = [normalized for token in phrase.split() if (normalized := _norm(token))]
        if not target or occurrence < 1:
            return None
        indexed_norms = [
            (index, normalized)
            for index, word in enumerate(self.words)
            if (normalized := _norm(word.text))
        ]
        norms = [normalized for _, normalized in indexed_norms]
        seen = 0
        for i in range(len(norms) - len(target) + 1):
            if norms[i : i + len(target)] == target:
                seen += 1
                if seen == occurrence:
                    start_index = indexed_norms[i][0]
                    end_index = indexed_norms[i + len(target) - 1][0]
                    return (self.words[start_index].start, self.words[end_index].end)
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
