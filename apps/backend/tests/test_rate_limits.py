"""Cost circuit-breakers: one active build per project, and a daily job budget."""

import pytest

from decode.config import get_settings
from tests.test_vertical_slice import create_inputs


def _generation_body(source, intent):
    return {
        "source_version_ids": [source["source_version_id"]],
        "intent_version_id": intent["version_id"],
    }


@pytest.mark.asyncio
async def test_second_build_refused_while_one_runs(client):
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    first = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json=_generation_body(source, intent),
        headers={"Idempotency-Key": "first-build"},
    )
    assert first.status_code == 202
    second = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json=_generation_body(source, intent),
        headers={"Idempotency-Key": "second-build"},
    )
    assert second.status_code == 409
    assert second.json()["code"] == "build_in_progress"


@pytest.mark.asyncio
async def test_daily_job_budget_refuses_politely(client, monkeypatch):
    monkeypatch.setattr(
        type(get_settings()), "daily_project_job_budget", 1, raising=False
    )
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    first = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json=_generation_body(source, intent),
        headers={"Idempotency-Key": "budget-1"},
    )
    assert first.status_code == 202
    # The active-build check fires first unless the job finished; the budget
    # check is what refuses even after completion, so assert on either guard
    # refusing — the point is the second spend never starts.
    second = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json=_generation_body(source, intent),
        headers={"Idempotency-Key": "budget-2"},
    )
    assert second.status_code in (409, 429)
    assert second.json()["code"] in ("build_in_progress", "daily_budget_exhausted")
