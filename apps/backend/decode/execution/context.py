"""Build the bounded context one department is allowed to receive.

This is intentionally not a memory store. V1 context is assembled from immutable
job inputs only. Semantic or episodic retrieval can be added behind this boundary
later without teaching departments about databases, embeddings, or approval
pointers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from ..departments import SourceInput
from ..models import ArtifactVersion, JobInput
from ..schemas import ProductionBrief, ProductionIntent, Script, TeachingPlan

if TYPE_CHECKING:
    from .pipeline import Stage


@dataclass(frozen=True)
class IntakeContext:
    intent: ProductionIntent
    sources: tuple[SourceInput, ...]
    input_version_ids: tuple[str, ...]


@dataclass(frozen=True)
class ArchitectContext:
    intent: ProductionIntent
    brief: ProductionBrief
    brief_version_id: str
    input_version_ids: tuple[str, ...]


@dataclass(frozen=True)
class AuthorContext:
    intent: ProductionIntent
    plan: TeachingPlan
    plan_version_id: str
    input_version_ids: tuple[str, ...]


@dataclass(frozen=True)
class VisualizerContext:
    intent: ProductionIntent
    plan: TeachingPlan
    script: Script
    script_version_id: str
    input_version_ids: tuple[str, ...]


@dataclass(frozen=True)
class VoiceContext:
    intent: ProductionIntent
    script: Script
    script_version_id: str
    input_version_ids: tuple[str, ...]


DepartmentContext = (
    IntakeContext | ArchitectContext | AuthorContext | VisualizerContext | VoiceContext
)


class ContextAssembler:
    """Validate immutable inputs and expose only the owning department's view."""

    def assemble(
        self,
        stage: Stage,
        inputs: list[JobInput],
        versions: dict[str, ArtifactVersion],
    ) -> DepartmentContext:
        roles = {item.role for item in inputs}
        if roles != set(stage.consumes):
            raise ValueError(
                f"{stage.kind} consumes {sorted(stage.consumes)}, but was given {sorted(roles)}"
            )
        missing = sorted(item.version_id for item in inputs if item.version_id not in versions)
        if missing:
            raise ValueError(f"context is missing artifact versions: {missing}")

        intent_input = self._single(inputs, "production_intent")
        intent_version = versions[intent_input.version_id]
        if intent_version.payload is None:
            raise ValueError("production intent input has no payload")
        intent = ProductionIntent.model_validate(intent_version.payload)
        input_version_ids = tuple(item.version_id for item in inputs)

        if stage.kind == "generate_production_brief":
            source_inputs = [item for item in inputs if item.role == "source"]
            if not source_inputs:
                raise ValueError("generate_production_brief requires at least one source")
            sources = tuple(
                SourceInput.from_manifest(versions[item.version_id].blob_manifest or {})
                for item in source_inputs
            )
            return IntakeContext(intent, sources, input_version_ids)

        if stage.kind == "generate_teaching_plan":
            brief_input = self._single(inputs, "production_brief")
            brief_version = versions[brief_input.version_id]
            if brief_version.payload is None:
                raise ValueError("production brief input has no payload")
            brief = ProductionBrief.model_validate(brief_version.payload)
            return ArchitectContext(
                intent=intent,
                brief=brief,
                brief_version_id=brief_input.version_id,
                input_version_ids=input_version_ids,
            )

        if stage.kind == "generate_script":
            plan_input = self._single(inputs, "teaching_plan")
            plan_version = versions[plan_input.version_id]
            if plan_version.payload is None:
                raise ValueError("teaching plan input has no payload")
            plan = TeachingPlan.model_validate(plan_version.payload)
            return AuthorContext(
                intent=intent,
                plan=plan,
                plan_version_id=plan_input.version_id,
                input_version_ids=input_version_ids,
            )

        if stage.kind == "generate_scene_visuals":
            script_input = self._single(inputs, "script")
            plan_input = self._single(inputs, "teaching_plan")
            script_version = versions[script_input.version_id]
            plan_version = versions[plan_input.version_id]
            if script_version.payload is None or plan_version.payload is None:
                raise ValueError("scene visuals inputs have no payload")
            return VisualizerContext(
                intent=intent,
                plan=TeachingPlan.model_validate(plan_version.payload),
                script=Script.model_validate(script_version.payload),
                script_version_id=script_input.version_id,
                input_version_ids=input_version_ids,
            )

        if stage.kind == "generate_voice":
            script_input = self._single(inputs, "script")
            script_version = versions[script_input.version_id]
            if script_version.payload is None:
                raise ValueError("voice input has no payload")
            return VoiceContext(
                intent=intent,
                script=Script.model_validate(script_version.payload),
                script_version_id=script_input.version_id,
                input_version_ids=input_version_ids,
            )

        raise ValueError(f"no context policy is registered for job kind {stage.kind!r}")

    @staticmethod
    def _single(inputs: list[JobInput], role: str) -> JobInput:
        matches = [item for item in inputs if item.role == role]
        if len(matches) != 1:
            raise ValueError(f"context requires exactly one {role} input")
        return matches[0]


context_assembler = ContextAssembler()
