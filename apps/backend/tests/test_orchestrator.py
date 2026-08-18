"""The orchestrator turns a natural-language request into a scoped proposal, or a
reply — and never mutates (AGENT-GRAPH §2; propose -> apply -> receipt)."""

import json

from decode.config import Settings
from decode.orchestrator import (
    TOOLS,
    Clarification,
    ClarifyOption,
    FakeOrchestrator,
    ModelOrchestrator,
    OrchestratorTurn,
    ProposedChange,
    SceneRef,
    build_orchestrator,
)

SCENES = [
    SceneRef(
        beat_id="beat-01",
        index=1,
        title="The bottleneck",
        narration="RNNs forget.",
        reason="show the information bottleneck as a narrowing path",
    ),
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


async def test_an_ambiguous_request_asks_a_pickable_question_not_a_dead_end():
    orch = FakeOrchestrator()
    turn = await orch.turn("make this more intuitive", SCENES)
    assert turn.proposal is None
    assert "name the scene" in turn.reply.lower()
    # It offers the scenes to pick, so "which one?" is one tap, not typing.
    assert turn.question is not None
    assert [o.label for o in turn.question.options] == ["Scene 1", "Scene 2", "Scene 3"]
    assert turn.question.options[0].detail  # each option names the scene


async def test_a_clear_request_proposes_directly_and_never_asks():
    orch = FakeOrchestrator()
    turn = await orch.turn("split scene 2", SCENES)
    assert turn.proposal is not None
    assert turn.question is None  # unambiguous -> no question, straight to a scope


async def test_an_out_of_range_scene_is_refused_not_guessed():
    orch = FakeOrchestrator()
    turn = await orch.turn("scene 9, add a diagram", SCENES)
    assert turn.proposal is None
    assert "no scene 9" in turn.reply.lower()
    assert "3 scene" in turn.reply  # tells them how many there are
    assert turn.question is not None  # and offers the real scenes to pick from


async def test_direction_survives_when_the_scene_ref_is_stripped():
    orch = FakeOrchestrator()
    turn = await orch.turn("In scene 3 slow the reveal down", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.args["beat_id"] == "beat-03"
    assert "slow the reveal down" in turn.proposal.args["direction"]


async def test_a_question_about_a_scene_answers_without_proposing_a_change():
    orch = FakeOrchestrator()
    turn = await orch.turn("Why does scene 1 use this visual?", SCENES)

    assert turn.proposal is None
    assert turn.question is None
    assert "information bottleneck" in turn.reply


async def test_direction_whitespace_is_normalized_after_scene_ref_is_removed():
    orch = FakeOrchestrator()
    turn = await orch.turn("Make scene 1 clearer", SCENES)

    assert turn.proposal is not None
    assert turn.proposal.args["direction"] == "Make clearer"


async def test_split_is_recognised_as_a_scene_op():
    orch = FakeOrchestrator()
    turn = await orch.turn("split scene 2", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.tool == "split_scene"
    assert turn.proposal.args == {"beat_id": "beat-02"}


async def test_delete_is_recognised_as_a_scene_op():
    orch = FakeOrchestrator()
    turn = await orch.turn("delete scene 1", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.tool == "delete_scene"
    assert turn.proposal.args == {"beat_id": "beat-01"}


async def test_fade_parses_the_edge_and_defaults_the_duration():
    orch = FakeOrchestrator()
    turn = await orch.turn("fade scene 3 out", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.tool == "set_fade"
    assert turn.proposal.args == {"beat_id": "beat-03", "edge": "out", "seconds": "1"}


async def test_fade_reads_a_stated_duration_not_the_scene_number():
    orch = FakeOrchestrator()
    turn = await orch.turn("fade scene 2 in over 3 seconds", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.args["seconds"] == "3"


async def test_retime_negates_when_shortening():
    orch = FakeOrchestrator()
    turn = await orch.turn("shorten scene 2 by 5 seconds", SCENES)
    assert turn.proposal is not None
    assert turn.proposal.tool == "retime_scene"
    assert turn.proposal.args["delta_seconds"] == "-5"


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
    # The endpoint streams SSE: step events while observing, then one done
    # event carrying the whole turn.
    assert response.headers["content-type"].startswith("text/event-stream")
    lines = response.text.splitlines()
    done_data = next(
        lines[i + 1].removeprefix("data: ")
        for i in range(len(lines))
        if lines[i] == "event: done"
    )
    body = json.loads(done_data)
    assert body["reply"]
    assert body["proposal"] is None
    # The turn rides with an observe trace, even when empty (the fake never looks).
    assert body["observed"] == []


async def test_turn_endpoint_404_for_a_missing_project(client):
    response = await client.post(
        "/api/v1/projects/does-not-exist/orchestrator/turn", json={"message": "hi"}
    )
    assert response.status_code == 404


# --- the registry is the mapping: every tool a hand can run, and vice versa ----

OBSERVE_TOOLS = {
    "get_project_state",
    "get_timeline",
    "get_scene",
    "screenshot_scene",
    "check_alignment",
    "get_script",
    "get_plan",
    "get_brief",
}

WRITE_TOOLS = {
    "reorder_beats",
    "cut_beat",
    "add_beat",
    "retime_beat",
    "rewrite_narration",
    "direct_scene",
    "regenerate_visual",
    "set_control",
    "record_narration",
    "split_scene",
    "merge_scenes",
    "duplicate_scene",
    "delete_scene",
    "retime_scene",
    "set_fade",
    "set_track",
    "set_z_order",
    "set_start",
    "render_export",
}


def test_registry_covers_every_tool_in_the_design():
    # AGENT-GRAPH §5 names exactly these 27 capabilities — no more, no fewer.
    assert set(TOOLS) == OBSERVE_TOOLS | WRITE_TOOLS


def test_observe_tools_are_read_only_and_write_tools_are_not():
    for name in OBSERVE_TOOLS:
        assert TOOLS[name].read_only is True, name
    for name in WRITE_TOOLS:
        assert TOOLS[name].read_only is False, name


def test_every_write_tool_names_the_args_its_proposal_must_fill():
    for name in WRITE_TOOLS:
        assert TOOLS[name].args, f"{name} has no args"


def test_every_tool_maps_to_a_real_operation_or_is_marked_planned():
    # `target` is one of three well-formed forms: a store action, an endpoint, or
    # an explicit "planned" for tools that do not exist yet.
    for name, tool in TOOLS.items():
        assert (
            tool.target.startswith("store:")
            or tool.target.startswith("endpoint:")
            or tool.target == "planned"
        ), f"{name} has an un-mapped target: {tool.target!r}"


def test_built_tools_map_to_real_endpoints():
    # The slice-1 tools that already ship point at the endpoints that run them.
    assert TOOLS["direct_scene"].target == "endpoint:POST /scene-visuals/regenerations"
    assert TOOLS["record_narration"].target == "endpoint:POST /voice/generations"
    assert TOOLS["render_export"].target == "endpoint:POST /projects/{id}/renders"


def test_planned_tools_are_the_future_work_only():
    # Only the tools without a real operation yet are marked planned: the vision
    # loop, alignment, timeline geometry, and free placement.
    planned = {name for name, tool in TOOLS.items() if tool.target == "planned"}
    assert planned == {
        "get_timeline",
        "get_scene",
        "screenshot_scene",
        "check_alignment",
        "set_track",
        "set_z_order",
        "set_start",
    }


# --- the real orchestrator swaps in behind the same contract ---


def test_build_selects_the_fake_without_model_credentials():
    assert isinstance(build_orchestrator(Settings()), FakeOrchestrator)


def test_build_selects_the_model_when_credentials_are_present():
    assert isinstance(
        build_orchestrator(Settings(orchestrator="auto", openai_api_key="sk-test")),
        ModelOrchestrator,
    )


def test_build_requires_a_key_for_the_real_orchestrator():
    import pytest

    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build_orchestrator(Settings(orchestrator="openai", openai_api_key=None))


def test_build_rejects_an_unknown_provider():
    import pytest

    with pytest.raises(ValueError, match="unknown orchestrator provider"):
        build_orchestrator(Settings(orchestrator="nope"))


def test_system_prompt_names_every_writable_tool():
    orch = ModelOrchestrator(Settings(orchestrator="openai", openai_api_key="sk-test"))
    prompt = orch._system_prompt()
    for name, tool in TOOLS.items():
        if not tool.read_only:
            assert name in prompt


def test_validate_coerces_args_to_strings_and_drops_extras():
    turn = OrchestratorTurn(
        reply="scoped",
        proposal=ProposedChange(
            tool="set_fade",
            args={"beat_id": "beat-01", "edge": "in", "seconds": 3, "extra": "x"},
            summary="s",
            changes="c",
            untouched="u",
            receipt="r",
        ),
    )
    validated = ModelOrchestrator._validate(turn)
    assert validated.proposal is not None
    assert validated.proposal.args == {"beat_id": "beat-01", "edge": "in", "seconds": "3"}


def test_to_turn_decodes_a_clarifying_question():
    from decode.orchestrator import _LLMClarification, _LLMClarifyOption, _LLMTurn

    llm = _LLMTurn(
        reply="Which one?",
        proposal=None,
        question=_LLMClarification(
            prompt="Which scene?",
            options=[_LLMClarifyOption(label="Scene 1", detail="Intro")],
        ),
    )
    turn = ModelOrchestrator._to_turn(llm)
    assert turn.proposal is None
    assert turn.question is not None
    assert turn.question.options[0].label == "Scene 1"


def test_validate_drops_the_question_when_a_real_proposal_is_present():
    turn = OrchestratorTurn(
        reply="scoped",
        proposal=ProposedChange(
            tool="split_scene",
            args={"beat_id": "beat-01"},
            summary="s",
            changes="c",
            untouched="u",
            receipt="r",
        ),
        question=Clarification(prompt="Which?", options=[ClarifyOption(label="x")]),
    )
    validated = ModelOrchestrator._validate(turn)
    assert validated.proposal is not None
    assert validated.question is None  # a scoped change wins over a question


def test_validate_rejects_an_unknown_tool():
    turn = OrchestratorTurn(
        reply="scoped",
        proposal=ProposedChange(
            tool="not_a_tool",
            args={},
            summary="s",
            changes="c",
            untouched="u",
            receipt="r",
        ),
    )
    assert ModelOrchestrator._validate(turn).proposal is None


# --- the on-demand observe loop: look before proposing ---


class _StubObserver:
    """Records what the orchestrator asked to see and answers with a marker."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    async def observe(self, name: str, args: dict) -> str:
        self.calls.append((name, args))
        return f"data-for-{name}"


def test_observe_tools_are_exactly_the_read_only_ones():
    orch = ModelOrchestrator(Settings(orchestrator="openai", openai_api_key="sk-test"))
    names = {tool["name"] for tool in orch._observe_tools()}
    assert names == OBSERVE_TOOLS
    for tool in orch._observe_tools():
        # a well-formed OpenAI function tool
        assert tool["type"] == "function"
        assert tool["parameters"]["additionalProperties"] is False


async def test_run_observe_serves_a_real_read_tool_through_the_observer():
    observer = _StubObserver()
    out = await ModelOrchestrator._run_observe("get_plan", "{}", observer)
    assert out == "data-for-get_plan"
    assert observer.calls == [("get_plan", {})]


async def test_run_observe_coerces_args_to_strings():
    observer = _StubObserver()
    await ModelOrchestrator._run_observe("get_scene", '{"beat_id": 2}', observer)
    # get_scene is planned -> unavailable, so the observer is never reached...
    assert observer.calls == []
    # ...but a served tool with args coerces them:
    await ModelOrchestrator._run_observe("get_brief", '{"x": 5}', observer)
    assert observer.calls == [("get_brief", {"x": "5"})]


async def test_run_observe_marks_a_planned_tool_unavailable_not_invented():
    import json

    out = await ModelOrchestrator._run_observe("check_alignment", "{}", _StubObserver())
    assert json.loads(out)["unavailable"] == "check_alignment"


async def test_run_observe_refuses_to_run_a_writable_tool_as_a_read():
    import json

    out = await ModelOrchestrator._run_observe("direct_scene", "{}", _StubObserver())
    assert "error" in json.loads(out)


def test_validate_rejects_a_read_only_tool():
    turn = OrchestratorTurn(
        reply="scoped",
        proposal=ProposedChange(
            tool="get_scene",
            args={"beat_id": "beat-01"},
            summary="s",
            changes="c",
            untouched="u",
            receipt="r",
        ),
    )
    assert ModelOrchestrator._validate(turn).proposal is None
