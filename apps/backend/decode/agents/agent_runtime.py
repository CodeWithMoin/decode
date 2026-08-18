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
READ_REFERENCE = "read_reference"
DELEGATE_PREFIX = "delegate_"

# Reviewed skills are packaged with the backend. The workspace-level agent catalog
# is outside the backend Docker context and may contain shell-oriented instructions.
_DEFAULT_SKILLS_ROOT = Path(__file__).parent / "remotion_skills"


@dataclass
class AgentResult:
    """What one run produced, and what it touched getting there."""

    output: Any  # a validated BaseModel (real) or a dict (fake) — the produced artifact
    usage: ProviderUsage
    skills_loaded: tuple[str, ...] = ()
    references_read: tuple[str, ...] = ()
    tools_called: tuple[str, ...] = ()
    delegated_to: tuple[str, ...] = ()
    repaired: bool = False


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

    def references(self, name: str) -> list[str]:
        """All Markdown depth files a skill ships, relative to its directory."""
        skill_dir = self.root / name
        if not skill_dir.is_dir():
            return []
        return sorted(
            str(path.relative_to(skill_dir))
            for path in skill_dir.rglob("*.md")
            if path.name != "SKILL.md"
        )

    def read_reference(self, name: str, file: str) -> str:
        """One Markdown depth file, path-guarded to the declared skill directory."""
        skill_dir = (self.root / name).resolve()
        target = (skill_dir / file).resolve()
        if (
            skill_dir not in target.parents
            or not target.is_file()
            or target.suffix.lower() != ".md"
        ):
            raise ValueError(f"{file!r} is not a reference of {name!r}")
        return target.read_text()


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
        # Core craft is loaded up front; the rest stays behind load_skill.
        self._eager = tuple(ref for ref in config.skills if ref.eager)
        self._on_demand = tuple(ref for ref in config.skills if not ref.eager)
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
        """The standing prompt: eager craft skills in full, plus a menu of the rest."""
        parts = [self.config.system]
        for ref in self._eager:
            body = self.library.load(ref.name)
            refs = self.library.references(ref.name)
            depth = (
                f"\n\nReference files you can `{READ_REFERENCE}` for depth: {', '.join(refs)}"
                if refs
                else ""
            )
            parts.append(f"## Skill — {ref.name}\n\n{body}{depth}")
        if self._on_demand:
            # The agent's own `why` is shown, not the skill's self-description, so
            # a skill written for another context still reads as relevant here.
            menu = "\n".join(
                f"- {ref.name}: {ref.why or self.library.describe(ref.name)}"
                for ref in self._on_demand
            )
            parts.append(
                "## Skills you can load\n\n"
                f"Call `{LOAD_SKILL}` with a name to read one in full when it applies; a "
                f"loaded skill lists its reference files, which you read with `{READ_REFERENCE}` "
                "for the deep detail.\n\n" + menu
            )
        return "\n\n".join(parts)

    def function_tools(self) -> list[dict[str, Any]]:
        """Everything the model may call this run: skill loading, read-only tools, and
        one delegation tool per declared sub-agent."""
        tools: list[dict[str, Any]] = []
        if self._on_demand:
            tools.append(_observe_tool(LOAD_SKILL, ["name"]))
        # Reference-reading is offered when any attached skill ships references
        # (eager skills list theirs in the prompt; on-demand ones on load).
        if any(self.library.references(ref.name) for ref in self.config.skills):
            tools.append(_observe_tool(READ_REFERENCE, ["skill", "file"]))
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
            if skill not in {ref.name for ref in self._on_demand}:
                return json.dumps({"error": f"{skill} is not a loadable skill"})
            touched.skills.append(skill)
            return json.dumps(
                {
                    "skill": skill,
                    "content": self.library.load(skill),
                    # so the model knows what it can drill into next
                    "references": self.library.references(skill),
                }
            )
        if name == READ_REFERENCE:
            skill, file = str(args.get("skill", "")), str(args.get("file", ""))
            if skill not in {ref.name for ref in self.config.skills}:
                return json.dumps({"error": f"{skill} is not a declared skill"})
            try:
                content = self.library.read_reference(skill, file)
            except (ValueError, OSError) as exc:
                return json.dumps({"error": str(exc)})
            touched.references.append(f"{skill}/{file}")
            return json.dumps({"skill": skill, "file": file, "content": content})
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
        touched.tools.append(name)
        if self.observer is None or spec.target == "planned":
            return json.dumps({"unavailable": name, "reason": "not available yet"})
        return await self.observer.observe(name, {k: str(v) for k, v in args.items()})

    async def run(
        self,
        assignment: str,
        text_format: type[BaseModel],
        *,
        validate: Callable[[Any], list[Any]] | None = None,
        repair_prompt: Callable[[list[Any]], str] | None = None,
    ) -> AgentResult:
        """Run the observe-loop. `validate` gates the produced output (e.g. the
        HyperFrames linter): a non-empty result triggers one repair turn, and a
        still-failing output raises rather than returning something invalid."""
        system = self.system()
        tools = self.function_tools()
        touched = _Touched()
        repaired = False
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
                if validate is not None:
                    problems = validate(response.output_parsed)
                    if problems and not repaired:
                        repaired = True
                        # The repair turn needs the rejected artifact as context. Without
                        # it, the model sees violations but not the draft it must preserve.
                        input_items.extend(response.output)
                        message = (
                            repair_prompt(problems)
                            if repair_prompt
                            else "Fix these and return the full corrected output:\n"
                            + json.dumps(problems, default=str)
                        )
                        input_items.append(
                            {"role": "user", "content": [{"type": "input_text", "text": message}]}
                        )
                        continue
                    if problems:
                        raise RuntimeError(
                            f"{self.config.name} failed validation after repair: {problems}"
                        )
                self.last_usage = ProviderUsage(self.model, in_tokens, out_tokens, turns)
                return AgentResult(
                    response.output_parsed,
                    self.last_usage,
                    tuple(touched.skills),
                    tuple(touched.references),
                    tuple(touched.tools),
                    tuple(touched.delegates),
                    repaired,
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
    references: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
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

    async def run(
        self,
        assignment: str,
        text_format: type[BaseModel] | None = None,
        *,
        validate: Callable[[Any], list[Any]] | None = None,
        repair_prompt: Callable[[list[Any]], str] | None = None,
    ) -> AgentResult:
        skills_loaded = [ref.name for ref in self.config.skills if self.library.load(ref.name)]
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
        return AgentResult(
            output, self.last_usage, tuple(skills_loaded), (), (), tuple(delegations)
        )

    def as_delegate(self, text_format: type[BaseModel] | None = None) -> Delegate:
        async def _run(assignment: str) -> str:
            result = await self.run(assignment)
            return json.dumps(result.output)

        return _run
