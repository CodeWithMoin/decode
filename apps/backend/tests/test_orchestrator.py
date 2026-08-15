"""The orchestrator turns a natural-language request into a scoped proposal, or a
reply — and never mutates (AGENT-GRAPH §2; propose -> apply -> receipt)."""

from decode.orchestrator import TOOLS, FakeOrchestrator, SceneRef

SCENES = [
    SceneRef(beat_id="beat-01", index=1, title="The bottleneck", narration="RNNs forget."),
    SceneRef(beat_id="beat-02", index=2, title="Attention", narration="Weigh what matters."),
    SceneRef(beat_id="beat-03", index=3, title="Q/K/V", narration="Query, key, value."),
]


async def test_a_scoped_request_becomes_a_direct_scene_proposal():
    orch = FakeOrchestrator()
    turn = await orch.turn("scene 2, make the fog thicker near the summit", SCENES)

    assert turn.proposal is not None
    p = turn.proposal
    assert p.tool == "direct_scene"
    assert p.tool in TOOLS  # every proposed tool is in the registry
    assert p.args == {"beat_id": "beat-02", "direction": "make the fog thicker near the summit"}
    # The scope is stated: what moves, what stays, and the receipt to post on apply.
    assert "scene 2" in p.summary.lower()
    assert "Scene 2" in p.changes
    assert "other scene" in p.untouched.lower()
    assert p.receipt
    # The room still speaks, and nothing has changed (it's only a proposal).
    assert "nothing has changed yet" in turn.reply.lower()


async def test_a_request_with_no_scene_gets_a_reply_not_a_proposal():
    orch = FakeOrchestrator()
    turn = await orch.turn("make this more intuitive", SCENES)
    assert turn.proposal is None
    assert "name the scene" in turn.reply.lower()


async def test_an_out_of_range_scene_is_refused_not_guessed():
    orch = FakeOrchestrator()
    turn = await orch.turn("scene 9, add a diagram", SCENES)
    assert turn.proposal is None
    assert "no scene 9" in turn.reply.lower()
    assert "3 scene" in turn.reply  # tells them how many there are


async def test_direction_survives_when_the_scene_ref_is_stripped():
    orch = FakeOrchestrator()
    turn = await orch.turn("In scene 3 slow the reveal down", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.args["beat_id"] == "beat-03"
    assert "slow the reveal down" in turn.proposal.args["direction"]


# --- endpoint wiring (the proposal logic itself is covered above) -------------


async def test_turn_endpoint_is_wired_and_read_only(client):
    project = await client.post(
        "/api/v1/projects", json={"title": "T"}, headers={"Idempotency-Key": "orch-p1"}
    )
    pid = project.json()["project_id"]
    # A fresh project has no plan yet -> no scenes -> a reply, never a proposal.
    # Proving the route loads scenes, delegates, and returns the turn shape.
    response = await client.post(
        f"/api/v1/projects/{pid}/orchestrator/turn", json={"message": "scene 1, make it bolder"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"]
    assert body["proposal"] is None


async def test_turn_endpoint_404_for_a_missing_project(client):
    response = await client.post(
        "/api/v1/projects/does-not-exist/orchestrator/turn", json={"message": "hi"}
    )
    assert response.status_code == 404
