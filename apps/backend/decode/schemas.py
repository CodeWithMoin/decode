from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Brand(BaseModel):
    colors: list[str] = Field(default_factory=list)
    fonts: str | None = None
    guidelines: str | None = None


class ProductionIntent(BaseModel):
    creative_brief: str | None = None
    audience: str = Field(min_length=1, max_length=500)
    target_duration_seconds: Literal[60, 180, 300, 600] | None = None
    runtime_mode: Literal["fixed", "deep_dive"]
    depth: Literal["intuition_first", "balanced", "rigorous"]
    narration_style: Literal["professional", "friendly", "storyteller"]
    brand: Brand = Field(default_factory=Brand)

    @model_validator(mode="after")
    def duration_matches_mode(self):
        if self.runtime_mode == "fixed" and self.target_duration_seconds is None:
            raise ValueError("target_duration_seconds is required for fixed runtime")
        if self.runtime_mode == "deep_dive" and self.target_duration_seconds is not None:
            raise ValueError("target_duration_seconds must be null for deep_dive")
        return self


class KeyConcept(BaseModel):
    name: str = Field(min_length=1)
    importance: Literal["core", "supporting"]


class TeachingOpportunity(BaseModel):
    title: str = Field(min_length=1)
    rationale: str = Field(min_length=1)


class ProductionBrief(BaseModel):
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    audience_profile: str = Field(min_length=1)
    learning_objectives: list[str]
    key_concepts: list[KeyConcept]
    prerequisites: list[str]
    scope_in: list[str]
    scope_out: list[str]
    teaching_opportunities: list[TeachingOpportunity]
    source_findings: dict
    open_questions: list[str]


class CreateProject(BaseModel):
    title: str | None = Field(default=None, max_length=300)


class GenerateBrief(BaseModel):
    source_version_ids: list[str] = Field(min_length=1)
    intent_version_id: str


class EditBrief(BaseModel):
    base_version_id: str
    schema_version: Literal[1] = 1
    payload: ProductionBrief


class ApproveVersion(BaseModel):
    decision: Literal["approved"]
    note: str | None = Field(default=None, max_length=2000)


class RetryRun(BaseModel):
    expected_failed_run_id: str


class Problem(BaseModel):
    model_config = ConfigDict(extra="allow")
    code: str
    status: int
    detail: str
    request_id: str
    retryable: bool = False
