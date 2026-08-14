import pytest

from decode.execution.context import ArchitectContext, IntakeContext, context_assembler
from decode.execution.pipeline import stage_for
from decode.models import ArtifactVersion, JobInput
from decode.schemas import ProductionBrief, ProductionIntent

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
)

BRIEF = ProductionBrief(
    title="Attention",
    summary="A grounded introduction.",
    audience_profile="Curious beginners",
    learning_objectives=["Explain self-attention"],
    key_concepts=[{"name": "Self-attention", "importance": "core"}],
    prerequisites=[],
    scope_in=["The mechanism"],
    scope_out=["Training infrastructure"],
    source_findings={"fixture": False},
    open_questions=[],
)


def artifact_version(
    version_id: str, *, payload: dict | None = None, blob_manifest: dict | None = None
) -> ArtifactVersion:
    return ArtifactVersion(
        id=version_id,
        artifact_id=f"artifact-{version_id}",
        sequence=1,
        schema_version=1,
        payload=payload,
        blob_manifest=blob_manifest,
        content_hash=f"hash-{version_id}",
        owner_role="creator",
        created_by="test",
    )


def job_input(version_id: str, role: str) -> JobInput:
    return JobInput(job_id="job-1", version_id=version_id, role=role)


def test_intake_context_receives_sources_but_not_the_brief():
    inputs = [job_input("source-1", "source"), job_input("intent-1", "production_intent")]
    versions = {
        "source-1": artifact_version(
            "source-1",
            blob_manifest={
                "object_key": "sources/attention.pdf",
                "filename": "attention.pdf",
                "media_type": "application/pdf",
                "size_bytes": 120,
                "sha256": "abc",
            },
        ),
        "intent-1": artifact_version("intent-1", payload=INTENT.model_dump(mode="json")),
    }

    context = context_assembler.assemble(stage_for("generate_production_brief"), inputs, versions)

    assert isinstance(context, IntakeContext)
    assert context.sources[0].filename == "attention.pdf"
    assert not hasattr(context, "brief")


def test_architect_context_receives_the_brief_but_not_sources():
    inputs = [
        job_input("brief-1", "production_brief"),
        job_input("intent-1", "production_intent"),
    ]
    versions = {
        "brief-1": artifact_version("brief-1", payload=BRIEF.model_dump(mode="json")),
        "intent-1": artifact_version("intent-1", payload=INTENT.model_dump(mode="json")),
    }

    context = context_assembler.assemble(stage_for("generate_teaching_plan"), inputs, versions)

    assert isinstance(context, ArchitectContext)
    assert context.brief.title == "Attention"
    assert context.brief_version_id == "brief-1"
    assert not hasattr(context, "sources")


def test_context_rejects_roles_outside_the_stage_contract():
    inputs = [job_input("intent-1", "production_intent")]
    versions = {"intent-1": artifact_version("intent-1", payload=INTENT.model_dump(mode="json"))}

    with pytest.raises(ValueError, match="consumes"):
        context_assembler.assemble(stage_for("generate_production_brief"), inputs, versions)


def test_context_rejects_missing_or_duplicate_required_versions():
    missing = [job_input("source-1", "source"), job_input("intent-1", "production_intent")]
    versions = {"intent-1": artifact_version("intent-1", payload=INTENT.model_dump(mode="json"))}
    with pytest.raises(ValueError, match="missing artifact versions"):
        context_assembler.assemble(stage_for("generate_production_brief"), missing, versions)

    duplicate = [
        job_input("brief-1", "production_brief"),
        job_input("intent-1", "production_intent"),
        job_input("intent-2", "production_intent"),
    ]
    duplicate_versions = {
        "brief-1": artifact_version("brief-1", payload=BRIEF.model_dump(mode="json")),
        "intent-1": artifact_version("intent-1", payload=INTENT.model_dump(mode="json")),
        "intent-2": artifact_version("intent-2", payload=INTENT.model_dump(mode="json")),
    }
    with pytest.raises(ValueError, match="exactly one production_intent"):
        context_assembler.assemble(
            stage_for("generate_teaching_plan"), duplicate, duplicate_versions
        )
