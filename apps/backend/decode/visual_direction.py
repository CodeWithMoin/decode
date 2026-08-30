"""Deterministic gates for visual direction against approved source decisions."""

from __future__ import annotations

from .schemas import Script, TeachingPlan, VisualDirection
from .timing import NarrationTiming, even_split_words


def _violation(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def validate_visual_direction(
    direction: VisualDirection,
    plan: TeachingPlan,
    script: Script,
) -> list[dict[str, str]]:
    """Validate direction against the exact approved plan and script inputs.

    Pydantic validates the aggregate's internal references. This gate validates
    lineage-owned facts the model cannot prove itself: beat coverage and whether
    phrase anchors exist, resolve in order, and end after they start.
    """

    violations: list[dict[str, str]] = []
    plan_ids = [beat.id for beat in plan.beats]
    script_ids = [beat.beat_id for beat in script.beats]
    direction_ids = [storyboard.beat_id for storyboard in direction.storyboards]

    if direction_ids != plan_ids:
        violations.append(
            _violation(
                "plan_beat_mismatch",
                "Visual direction must cover the approved plan beats in order.",
            )
        )
    if script_ids != plan_ids:
        violations.append(
            _violation(
                "script_beat_mismatch",
                "The approved script must cover the approved plan beats in order.",
            )
        )

    narrations = {beat.beat_id: beat.narration for beat in script.beats}
    planned = {beat.id: beat for beat in plan.beats}
    for storyboard in direction.storyboards:
        plan_beat = planned.get(storyboard.beat_id)
        for subject in storyboard.subjects:
            binding = subject.source_binding
            if binding is None:
                continue
            if binding.beat_id != storyboard.beat_id or plan_beat is None:
                violations.append(
                    _violation(
                        "invalid_source_binding",
                        f"{storyboard.beat_id}/{subject.id} must bind to its own approved beat.",
                    )
                )
            elif binding.field == "key_point" and (
                binding.key_point_index is None
                or binding.key_point_index >= len(plan_beat.key_points)
            ):
                violations.append(
                    _violation(
                        "invalid_source_binding",
                        f"{storyboard.beat_id}/{subject.id} binds to a missing key point.",
                    )
                )
            elif binding.field in {"example", "visual_opportunity"} and not getattr(
                plan_beat, binding.field
            ):
                violations.append(
                    _violation(
                        "invalid_source_binding",
                        f"{storyboard.beat_id}/{subject.id} binds to an empty plan field.",
                    )
                )

        narration = narrations.get(storyboard.beat_id)
        if narration is None:
            continue
        timing = NarrationTiming(duration=1.0, words=even_split_words(narration, 1.0))
        previous_start = -1.0
        for operation in storyboard.operations:
            start = operation.anchor.resolve(timing)
            if start is None:
                violations.append(
                    _violation(
                        "unresolved_operation_anchor",
                        f"{storyboard.beat_id}/{operation.id} starts on words absent "
                        "from its narration.",
                    )
                )
                continue
            if start < previous_start:
                violations.append(
                    _violation(
                        "operation_order",
                        f"{storyboard.beat_id}/{operation.id} starts before the "
                        "preceding operation.",
                    )
                )
            previous_start = max(previous_start, start)

            if operation.end_anchor is None:
                continue
            end = operation.end_anchor.resolve(timing)
            if end is None:
                violations.append(
                    _violation(
                        "unresolved_operation_end",
                        f"{storyboard.beat_id}/{operation.id} ends on words absent "
                        "from its narration.",
                    )
                )
            elif end < start:
                violations.append(
                    _violation(
                        "operation_end_before_start",
                        f"{storyboard.beat_id}/{operation.id} ends before it starts.",
                    )
                )

    return violations
