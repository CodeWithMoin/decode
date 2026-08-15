"""The in-process agent runtime — one generalization of the two loops we already run.

`ModelAgent._draft` (_agent.py) is the structured draft call every generative
department shares. `ModelOrchestrator.turn` (orchestrator.py) is the observe-loop:
call the model, run the tools it asks for, feed the results back, repeat until it
answers. `AgentRuntime.run` is those two composed and parameterized by an `AgentConfig`,
plus two capabilities the department loops did not have:

  * **progressive disclosure** — a skill's full text is loaded only when the model calls
    `load_skill`, so the system prompt lists names + one-line descriptions, not bodies.
  * **multiagent delegation** — a coordinator calls a named sub-agent as a tool, awaits
    it, and gets its produced artifact back. A delegate is just "hand it an assignment,
    get JSON back" (`Delegate`), so a sub-`AgentRuntime` bound to its own output schema
    satisfies it without the coordinator knowing that schema.

Fake-first: `FakeAgentRuntime` runs the same shape deterministically with no model call,
so the whole suite is green on fakes and a delegation round-trip is testable offline.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from ..config import Settings
from ..orchestrator import TOOLS, Observer
from .agent_config import AgentConfig
from .contracts import ProviderUsage
from .skills import SkillSet

# "Hand it an assignment, get its produced artifact back as JSON." A sub-agent's
# `as_delegate(...)` returns one of these; the coordinator never sees the sub's schema.
Delegate = Callable[[str], Awaitable[str]]

LOAD_SKILL = "load_skill"
DELEGATE_PREFIX = "delegate_"

# The vendored public skills live at the repo root, not under the backend package.
_DEFAULT_SKILLS_ROOT = Path(__file__).resolve().parents[4] / ".claude" / "skills"


@dataclass
class AgentResult:
    """What one run produced, and what it touched getting there."""

    output: Any  # a validated BaseModel (real) or a dict (fake) — the produced artifact
    usage: ProviderUsage
    skills_loaded: tuple[str, ...] = ()
    delegated_to: tuple[str, ...] = ()


class SkillLibrary:
    """A skill's text, by name, on demand. Progressive disclosure lives here: the
    body is read (and cached) only when `load` is called, never eagerly."""

    def __init__(self, root: Path | None = None):
        self.root = root or _DEFAULT_SKILLS_ROOT
        self._bodies: dict[str, str] = {}

    def describe(self, name: str) -> str:
        """The one-line description for the system prompt — frontmatter only, no body."""
        front, _ = SkillSet(self.root / name)._split()
        return str(front.get("description", "")).strip()

    def load(self, name: str) -> str:
        """The full skill text, read once and cached."""
        if name not in self._bodies:
            _, body = SkillSet(self.root / name)._split()
            self._bodies[name] = body
        return self._bodies[name]


def _observe_tool(name: str, args: list[str]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": TOOLS[name].description if name in TOOLS else name,
        "parameters": {
            "type": "object",
            "properties": {arg: {"type": "string"} for arg in args},
            "required": args,
            "additionalProperties": False,
        },
    }


class AgentRuntime:
    """Config + skills + tools + delegation, run through the model's observe-loop.

    The OpenAI client is built lazily so the tool surface (`function_tools`) and the
    system prompt can be inspected without credentials — the same reason the tests can
    exercise the shape without ever reaching a provider.
    """

    def __init__(
        self,
        settings: Settings,
        config: AgentConfig,
        *,
        library: SkillLibrary | None = None,
        observer: Observer | None = None,
        delegates: dict[str, Delegate] | None = None,
    ):
        self.settings = settings
        self.config = config
        self.model = config.model.id
        self.library = library or SkillLibrary()
        self.observer = observer
        self.delegates = delegates or {}
        self.last_usage: ProviderUsage | None = None
        self._client: Any = None

    @property
    def client(self) -> Any:
        if self._client is None:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=self.settings.openai_api_key, base_url=self.settings.openai_base_url
            )
        return self._client

    def system(self) -> str:
        """The standing prompt, plus the menu of skills the model may pull in."""
        prompt = self.config.system
        if self.config.skills:
            menu = "\n".join(
                f"- {name}: {self.library.describe(name)}" for name in self.config.skills
            )
            prompt += (
                "\n\n## Skills you can load\n\n"
                f"Call `{LOAD_SKILL}` with a name to read one in full when it applies — "
                "they are not all loaded up front.\n\n" + menu
            )
        return prompt

    def function_tools(self) -> list[dict[str, Any]]:
        """Everything the model may call this run: skill loading, read-only tools, and
        one delegation tool per declared sub-agent."""
        tools: list[dict[str, Any]] = []
        if self.config.skills:
            tools.append(_observe_tool(LOAD_SKILL, ["name"]))
        # Advertise only read-only tools that are actually built: a `planned`
        # (unbuilt) tool would be advertised, then `_dispatch` would return
        # "unavailable" — the model burns a turn on a tool that can never work.
        for name in self.config.tools:
            spec = TOOLS.get(name)
            if spec is not None and spec.read_only and spec.target != "planned":
                tools.append(_observe_tool(name, spec.args))
        for name in self.config.multiagent:
            tools.append(
                {
                    "type": "function",
                    "name": f"{DELEGATE_PREFIX}{name}",
                    "description": f"Delegate to the {name} sub-agent; returns its artifact.",
                    "parameters": {
                        "type": "object",
                        "properties": {"assignment": {"type": "string"}},
                        "required": ["assignment"],
                        "additionalProperties": False,
                    },
                }
            )
        return tools

    async def _dispatch(self, name: str, arguments: str, touched: _Touched) -> str:
        """Run one tool call and return the JSON the model reads back."""
        try:
            args = json.loads(arguments) if arguments else {}
        except json.JSONDecodeError:
            args = {}
        if name == LOAD_SKILL:
            skill = str(args.get("name", ""))
            if skill not in self.config.skills:
                return json.dumps({"error": f"{skill} is not a declared skill"})
            touched.skills.append(skill)
            return json.dumps({"skill": skill, "content": self.library.load(skill)})
        if name.startswith(DELEGATE_PREFIX):
            sub = name[len(DELEGATE_PREFIX) :]
            delegate = self.delegates.get(sub)
            if delegate is None:
                return json.dumps({"unavailable": sub, "reason": "no delegate wired"})
            touched.delegates.append(sub)
            return await delegate(str(args.get("assignment", "")))
        spec = TOOLS.get(name)
        if spec is None or not spec.read_only:
            return json.dumps({"error": f"{name} is not a readable tool"})
        if self.observer is None or spec.target == "planned":
            return json.dumps({"unavailable": name, "reason": "not available yet"})
        return await self.observer.observe(name, {k: str(v) for k, v in args.items()})

    async def run(self, assignment: str, text_format: type[BaseModel]) -> AgentResult:
        system = self.system()
        tools = self.function_tools()
        touched = _Touched()
        input_items: list[Any] = [
            {"role": "user", "content": [{"type": "input_text", "text": assignment}]}
        ]
        in_tokens = out_tokens = turns = 0

        for _ in range(self.config.max_turns):
            response = await self.client.responses.parse(
                model=self.model,
                instructions=system,
                input=input_items,
                tools=tools,
                text_format=text_format,
                reasoning={"effort": self.config.model.effort},
            )
            turns += 1
            usage = response.usage
            if usage:
                in_tokens += usage.input_tokens
                out_tokens += usage.output_tokens
            calls = [
                item for item in response.output if getattr(item, "type", None) == "function_call"
            ]
            if not calls:
                if response.output_parsed is None:
                    raise RuntimeError(f"{self.config.name} returned no parsed output")
                self.last_usage = ProviderUsage(self.model, in_tokens, out_tokens, turns)
                return AgentResult(
                    response.output_parsed,
                    self.last_usage,
                    tuple(touched.skills),
                    tuple(touched.delegates),
                )
            input_items.extend(response.output)
            for call in calls:
                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": await self._dispatch(call.name, call.arguments, touched),
                    }
                )

        raise RuntimeError(f"{self.config.name} kept calling tools without producing output")

    def as_delegate(self, text_format: type[BaseModel]) -> Delegate:
        """Bind this runtime to its output schema so a coordinator can call it as a tool."""

        async def _run(assignment: str) -> str:
            result = await self.run(assignment, text_format)
            output = result.output
            return output.model_dump_json() if isinstance(output, BaseModel) else json.dumps(output)

        return _run


@dataclass
class _Touched:
    skills: list[str] = field(default_factory=list)
    delegates: list[str] = field(default_factory=list)


class FakeAgentRuntime:
    """Deterministic agent — no model call, labels its output `fixture: True`.

    Mirrors `FakeOrchestrator` / `FakeVisualizer`: it runs the real shape (pull every
    declared skill, delegate to every wired sub-agent) so a coordinator/sub-agent
    round-trip is exercised offline, then emits a labelled dict instead of drafting.
    """

    identifier = "agent/fixture-v1"

    def __init__(
        self,
        config: AgentConfig,
        *,
        library: SkillLibrary | None = None,
        delegates: dict[str, Delegate] | None = None,
    ):
        self.config = config
        self.library = library or SkillLibrary()
        self.delegates = delegates or {}
        self.last_usage: ProviderUsage | None = None

    async def run(self, assignment: str, text_format: type[BaseModel] | None = None) -> AgentResult:
        skills_loaded = [name for name in self.config.skills if self.library.load(name)]
        delegations: dict[str, Any] = {}
        for name in self.config.multiagent:
            delegate = self.delegates.get(name)
            if delegate is not None:
                delegations[name] = json.loads(await delegate(assignment))
        output: dict[str, Any] = {
            "fixture": True,
            "agent": self.config.name,
            "produces": self.config.produces,
            "assignment": assignment,
            "skills_loaded": skills_loaded,
            "delegations": delegations,
        }
        self.last_usage = ProviderUsage("fixture", 0, 0, 1)
        return AgentResult(output, self.last_usage, tuple(skills_loaded), tuple(delegations))

    def as_delegate(self, text_format: type[BaseModel] | None = None) -> Delegate:
        async def _run(assignment: str) -> str:
            result = await self.run(assignment)
            return json.dumps(result.output)

        return _run
