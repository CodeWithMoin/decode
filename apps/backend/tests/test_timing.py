"""The beat-timing model: narration is the authority, anchors resolve to it.

Proves the core of the audio/beat-sync feature (AUDIO-SYNC-PROPOSAL §10):
narration determines timing, visual/sound events align to it by semantic anchor,
and a narration change re-resolves the same anchors to new times with nobody
hand-fixing a number.
"""

from decode.timing import Anchor, NarrationTiming, Word, even_split_words, resolve_beats

# "The trophy receives the largest attention weight." with per-word timings.
NARRATION = NarrationTiming(
    duration=3.0,
    words=[
        Word(text="The", start=0.0, end=0.2),
        Word(text="trophy", start=0.2, end=0.6),
        Word(text="receives", start=0.6, end=1.1),
        Word(text="the", start=1.1, end=1.2),
        Word(text="largest", start=1.2, end=1.7),
        Word(text="attention", start=1.7, end=2.3),
        Word(text="weight.", start=2.3, end=2.8),
    ],
)

# The scene's declared beats — none carry an absolute second of their own.
ANCHORS = [
    Anchor(name="attention_weight_reveal", kind="phrase", phrase="largest attention weight"),
    Anchor(name="tokens_fade", kind="progress", at=0.9),
    Anchor(name="hard_pin", kind="time", at=1.5),
]


def test_phrase_anchor_resolves_to_when_the_words_are_spoken():
    # §10.1/2: the reveal lands when the narrator begins "largest attention weight".
    resolved = resolve_beats(ANCHORS, NARRATION)
    assert resolved.times["attention_weight_reveal"] == 0.2 + 1.0  # start of "largest" = 1.2
    assert resolved.times["tokens_fade"] == 2.7  # 0.9 * 3.0
    assert resolved.times["hard_pin"] == 1.5
    assert resolved.unresolved == []


def test_phrase_alignment_start_mid_end():
    start, end = 1.2, 2.8
    for align, expected in (("start", start), ("end", end), ("mid", (start + end) / 2)):
        anchor = Anchor(name="a", kind="phrase", phrase="largest attention weight", align=align)
        assert resolve_beats([anchor], NARRATION).times["a"] == round(expected, 3)


def test_narration_change_re_resolves_without_touching_the_anchor():
    """§10.4 — the load-bearing one. Slow the narration down: the SAME anchors
    resolve to NEW times. If any downstream time were hard-coded it would now be
    wrong; because beats are anchor-relative, re-resolving is the whole fix."""
    slower = NarrationTiming(
        duration=4.0,
        words=[Word(text=w.text, start=w.start + 0.5, end=w.end + 0.5) for w in NARRATION.words],
    )
    before = resolve_beats(ANCHORS, NARRATION).times
    after = resolve_beats(ANCHORS, slower).times

    assert before["attention_weight_reveal"] == 1.2
    assert after["attention_weight_reveal"] == 1.7  # followed the narration, +0.5
    assert before["tokens_fade"] != after["tokens_fade"]  # 0.9 * 3.0 vs 0.9 * 4.0
    assert after["tokens_fade"] == 3.6


def test_a_missing_phrase_is_surfaced_not_guessed():
    # Rewrite the sentence: the anchor's phrase is gone. It must not fire at 0s —
    # it is reported unresolved so a creator sees the beat has nothing to attach to.
    rewritten = NarrationTiming(
        duration=2.0,
        words=[Word(text="Attention", start=0.0, end=0.6), Word(text="weighs", start=0.6, end=1.2)],
    )
    resolved = resolve_beats(ANCHORS, rewritten)
    assert "attention_weight_reveal" not in resolved.times
    assert [u.name for u in resolved.unresolved] == ["attention_weight_reveal"]
    # progress/time anchors still resolve — they do not depend on the words.
    assert resolved.times["tokens_fade"] == 1.8  # 0.9 * 2.0


def test_even_split_words_span_the_duration_and_are_ordered():
    words = even_split_words("The trophy receives the largest attention weight.", 3.5)
    assert [w.text for w in words] == "The trophy receives the largest attention weight.".split()
    assert words[0].start == 0.0
    assert words[-1].end == 3.5
    assert all(a.end <= b.start + 1e-9 for a, b in zip(words, words[1:], strict=False))  # monotonic
    # A phrase anchor resolves against even-split words, just less precisely.
    timing = NarrationTiming(duration=3.5, words=words)
    resolved = resolve_beats([Anchor(name="a", kind="phrase", phrase="attention weight")], timing)
    assert resolved.times["a"] == round(5 * (3.5 / 7), 3)  # start of the 6th word

    assert even_split_words("", 3.0) == []
    assert even_split_words("word", 0) == []


def test_progress_and_time_anchors_clamp_into_the_scene():
    over = [
        Anchor(name="past_end", kind="progress", at=1.5),
        Anchor(name="negative", kind="time", at=-2.0),
        Anchor(name="past_dur", kind="time", at=99.0),
    ]
    times = resolve_beats(over, NARRATION).times
    assert times["past_end"] == 3.0  # clamped to duration
    assert times["negative"] == 0.0
    assert times["past_dur"] == 3.0


def test_align_words_maps_stt_onto_narration_tokens():
    from decode.timing import align_words_to_tokens

    narration = "The loss is high, then it drops low."
    # STT drops "the", ignores punctuation, has real times for the rest.
    stt = [
        ("loss", 0.5, 0.9), ("is", 0.9, 1.1), ("high", 1.1, 1.6),
        ("then", 2.0, 2.3), ("it", 2.3, 2.5), ("drops", 2.5, 3.0), ("low", 3.2, 3.7),
    ]
    words = align_words_to_tokens(narration, stt, 4.0)
    # one Word per narration token, indices preserved
    assert [w.text for w in words] == narration.split()
    # matched tokens land on their spoken time (punctuation-insensitive)
    assert words[3].text == "high," and words[3].start == 1.1
    assert words[7].text == "low." and words[7].start == 3.2
    # monotonic, clamped into [0, duration]
    starts = [w.start for w in words]
    assert starts == sorted(starts) and starts[0] >= 0 and words[-1].end <= 4.0


def test_align_words_falls_back_when_no_stt():
    from decode.timing import align_words_to_tokens, even_split_words

    narration = "A short line of narration."
    assert align_words_to_tokens(narration, [], 3.0) == even_split_words(narration, 3.0)
