from __future__ import annotations

import json

from ...schemas import BeatNarration, TeachingPlan

# Words a synthesized voice gets through in a second, at Decode's default pace.
#
# This is a planning constant, not a measurement: the real number comes back
# from TTS with the alignment, and only then does a scene have a true duration.
# Its job here is to catch a script that is obviously the wrong size for the
# runtime the creator approved, early enough that fixing it costs one turn.
WORDS_PER_SECOND = 2.5

# How far a passage may sit from its budget before it counts as a violation.
# Tight enough to catch "wrote a paragraph for a ten second beat", loose enough
# that ordinary variation in sentence length is not a repair turn.
TOLERANCE = 0.10


def word_count(narration: str) -> int:
    return len(narration.split())


def target_words(seconds: int) -> int:
    return round(seconds * WORDS_PER_SECOND)


def validate_script(
    narration: list[BeatNarration],
    plan: TeachingPlan,
) -> list[dict[str, str]]:
    """Return deterministic violations that a single repair turn can address."""

    violations: list[dict[str, str]] = []
    plan_ids = [beat.id for beat in plan.beats]
    written_ids = [item.beat_id for item in narration]

    if len(set(written_ids)) != len(written_ids):
        violations.append(_violation("duplicate_beats", "Each beat may have only one passage."))

    missing = [beat_id for beat_id in plan_ids if beat_id not in set(written_ids)]
    if missing:
        violations.append(
            _violation(
                "missing_beats",
                f"Every beat in the plan needs a passage; missing: {', '.join(missing)}.",
            )
        )

    unknown = [beat_id for beat_id in written_ids if beat_id not in set(plan_ids)]
    if unknown:
        violations.append(
            _violation(
                "unknown_beats",
                f"These passages name beats the plan does not contain: {', '.join(unknown)}.",
            )
        )

    # Order matters as much as membership: the script is read start to finish,
    # and a correct set of passages in the wrong sequence is still the wrong
    # video.
    if written_ids != plan_ids and not missing and not unknown:
        violations.append(
            _violation("beat_order", "Passages must appear in the plan's beat order.")
        )

    budgets = {beat.id: beat.target_duration_seconds for beat in plan.beats}
    for item in narration:
        seconds = budgets.get(item.beat_id)
        if seconds is None:
            continue
        target = target_words(seconds)
        actual = word_count(item.narration)
        allowed = max(1, round(target * TOLERANCE))
        if abs(actual - target) > allowed:
            violations.append(
                _violation(
                    "word_budget",
                    f"{item.beat_id} is {actual} words against a {seconds}s budget; "
                    f"aim for about {target} words (±{allowed}).",
                )
            )

    return violations


def repair_message(violations: list[dict[str, str]], guidance: str) -> str:
    return (
        f"{guidance}\n\nDeterministic violations:\n"
        f"{json.dumps(violations, ensure_ascii=True, indent=2)}"
    )


def _violation(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}
