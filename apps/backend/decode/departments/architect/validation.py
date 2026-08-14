from __future__ import annotations

import json

from ...schemas import Beat, PlanSection, ProductionBrief, ProductionIntent


def validate_plan(
    sections: list[PlanSection],
    beats: list[Beat],
    intent: ProductionIntent,
    brief: ProductionBrief,
) -> list[dict[str, str]]:
    """Return deterministic violations that a single repair turn can address."""

    violations: list[dict[str, str]] = []
    section_ids = [section.id for section in sections]
    beat_ids = [beat.id for beat in beats]

    if len(set(section_ids)) != len(section_ids):
        violations.append(_violation("duplicate_section_ids", "Section ids must be unique."))
    if len(set(beat_ids)) != len(beat_ids):
        violations.append(_violation("duplicate_beat_ids", "Beat ids must be unique."))

    declared = set(section_ids)
    used = {beat.section_id for beat in beats}
    missing_sections = [section_id for section_id in section_ids if section_id not in used]
    if missing_sections:
        violations.append(
            _violation(
                "empty_sections",
                f"Every declared section needs a beat; empty: {', '.join(missing_sections)}.",
            )
        )
    unknown_sections = sorted(used - declared)
    if unknown_sections:
        violations.append(
            _violation(
                "unknown_sections",
                f"Beats reference undeclared sections: {', '.join(unknown_sections)}.",
            )
        )

    order = {section_id: index for index, section_id in enumerate(section_ids)}
    positions = [order.get(beat.section_id, -1) for beat in beats]
    if any(current < previous for previous, current in zip(positions, positions[1:], strict=False)):
        violations.append(
            _violation(
                "section_order",
                "Beats must use sections contiguously in the declared section order.",
            )
        )

    seen_beats: set[str] = set()
    for beat in beats:
        invalid_dependencies = [item for item in beat.depends_on if item not in seen_beats]
        if invalid_dependencies:
            violations.append(
                _violation(
                    "invalid_dependencies",
                    f"{beat.id} depends on beats that do not appear earlier: "
                    f"{', '.join(invalid_dependencies)}.",
                )
            )
        seen_beats.add(beat.id)

        invalid_objectives = [
            index
            for index in beat.brief_support.learning_objectives
            if index < 0 or index >= len(brief.learning_objectives)
        ]
        invalid_scope = [
            index
            for index in beat.brief_support.scope_in
            if index < 0 or index >= len(brief.scope_in)
        ]
        concept_names = {concept.name for concept in brief.key_concepts}
        invalid_concepts = [
            name for name in beat.brief_support.key_concepts if name not in concept_names
        ]
        if invalid_objectives or invalid_scope or invalid_concepts:
            violations.append(
                _violation(
                    "invalid_brief_support",
                    f"{beat.id} contains support references that do not exist "
                    "in the approved brief.",
                )
            )

    if intent.runtime_mode == "fixed" and intent.target_duration_seconds is not None:
        planned = sum(beat.target_duration_seconds for beat in beats)
        if planned != intent.target_duration_seconds:
            violations.append(
                _violation(
                    "runtime_budget",
                    f"Estimated beat budgets total {planned}s; they must total "
                    f"{intent.target_duration_seconds}s.",
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
