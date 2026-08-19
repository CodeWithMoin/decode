"""The Intake department — the Producer crew role's Understanding stage.

One agent, one tool, a bounded loop. The department reads the attached sources,
records grounded findings, then emits a schema-valid Production Brief.

Sub-agents are deliberately absent. Intake is one craft producing one artifact,
and unlike Motion Designer there is no context-isolation boundary to enforce:
reading the source *is* the job, so splitting it would hand the source to both
halves. Multi-source projects are the case that will earn a split, because a
synthesis agent genuinely does not need the raw documents.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from pydantic import BaseModel, Field

from ...config import Settings
from ...providers.storage import ObjectStore, object_store
from ...schemas import KeyConcept, ProductionBrief, ProductionIntent
from .. import tracing
from ..contracts import ProviderUsage
from .prompt import SKILLS, build_instructions
from .tools import TOOLS, TOOLS_VERSION, FindingLog

# A runaway loop against a metered API is a bill, not a hang.
MAX_TURNS = 12

# Under this many characters of text source, there is no document to analyse —
# the "source" is a typed topic, and the full grounding machinery (the 174-line
# document SKILL, record_finding, the unconditional reflection pass) is spend
# without a subject. The compact topic prompt takes over; the full path stays
# armed for real uploads.
TOPIC_SOURCE_LIMIT = 500
_TOPIC_SYSTEM = (Path(__file__).parent / "topic-system.md").read_text(encoding="utf-8")


class IntakeBriefDraft(BaseModel):
    """What the model produces.

    Deliberately not `ProductionBrief`: that carries `source_findings`, a
    free-form dict which strict structured outputs reject — and which the model
    should not be authoring anyway. Provenance is assembled by the harness from
    what `record_finding` actually captured, so the brief cannot claim a source
    it never cited.
    """

    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    audience_profile: str = Field(min_length=1)
    learning_objectives: list[str]
    key_concepts: list[KeyConcept]
    prerequisites: list[str]
    scope_in: list[str]
    scope_out: list[str]
    open_questions: list[str]


class ModelIntake:
    identifier = f"intake/{SKILLS.version}/{TOOLS_VERSION}"

    def __init__(self, settings: Settings, store: ObjectStore):
        from openai import AsyncOpenAI

        self.settings = settings
        self.store = store
        self.model = settings.openai_model
        # Traced or not depending on tracing.install_openai_tracing(), which
        # patches this class in place at worker startup.
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        # ponytail: usage rides on the instance because the Intake port returns
        # only a brief. One instance is built per run, so this is not shared.
        # Return a result object instead once the manifest needs the same path.
        self.last_usage: ProviderUsage | None = None

    async def _content_for(self, source) -> dict:
        """Attach a source in whichever form the model can actually read."""
        raw = await self.store.get(source.object_key)
        if source.media_type == "application/pdf":
            encoded = base64.b64encode(raw).decode()
            return {
                "type": "input_file",
                "filename": source.filename or "source.pdf",
                "file_data": f"data:application/pdf;base64,{encoded}",
            }
        # Everything else is text Decode already accepted at upload.
        text = raw.decode("utf-8", errors="replace")
        return {
            "type": "input_text",
            "text": json.dumps(
                {
                    "content_type": "untrusted_source_text",
                    "filename": source.filename,
                    "text": text,
                },
                ensure_ascii=True,
            ),
        }

    async def _call(self, system: str, history: list, tools: list = TOOLS):
        """One model turn. When a stage is streaming, the reasoning summary is
        streamed live to the chat as prose; otherwise a normal structured call.
        Same response interface either way (usage / output / output_parsed)."""
        from ...execution import streaming

        ctx = streaming.current()
        if ctx is not None:
            url = self.settings.redis_url
            await streaming.begin(url, ctx)
            final = await streaming.stream_call(
                self.client, url, ctx,
                rewrite_model=self.settings.orchestrator_model,
                model=self.model,
                instructions=system,
                input=history,
                tools=tools,
                text_format=IntakeBriefDraft,
            )
            await streaming.end(url, ctx)
            if final is not None:
                return final
        return await self.client.responses.parse(
            model=self.model,
            instructions=system,
            input=history,
            tools=tools,
            text_format=IntakeBriefDraft,
        )

    async def _converse(
        self, phase: str, system: str, history: list, findings: FindingLog,
        tools: list = TOOLS,
    ) -> tuple[IntakeBriefDraft, int, int, int]:
        """Run the tool loop until the model answers with a brief.

        Every model turn is appended to `history`, so a caller can keep the same
        thread going: reflection continues the conversation the draft came from
        rather than describing the draft back to a model that has forgotten it.
        """
        input_tokens = output_tokens = turns = 0

        # One span per phase, so a draft that took nine turns and a reflection
        # that took one are distinguishable at a glance rather than a flat run
        # of calls. The model calls inside are traced by the OpenAI wrapper.
        with tracing.span(phase) as observed:
            for _ in range(MAX_TURNS):
                response = await self._call(system, history, tools)
                turns += 1
                if response.usage:
                    input_tokens += response.usage.input_tokens
                    output_tokens += response.usage.output_tokens
                history.extend(response.output)

                calls = [item for item in response.output if item.type == "function_call"]
                if not calls:
                    if response.output_parsed is None:
                        raise RuntimeError("intake returned no parsed brief")
                    observed.update(
                        output={"turns": turns, "findings": len(findings.entries)},
                    )
                    return response.output_parsed, input_tokens, output_tokens, turns

                for call in calls:
                    arguments = json.loads(call.arguments)
                    # The claim and its locator, recorded as they happen. This is
                    # the question a wrong brief actually raises — not "what did
                    # the model say" but "what did it think the source said, and
                    # where did it think that was".
                    tracing.event(name=f"finding.{call.name}", input=arguments)
                    history.append(
                        {
                            "type": "function_call_output",
                            "call_id": call.call_id,
                            "output": findings.dispatch(call.name, arguments),
                        }
                    )

        raise RuntimeError(f"intake did not produce a brief within {MAX_TURNS} turns")

    async def generate(self, intent: ProductionIntent, sources: list) -> ProductionBrief:
        # Read the owner-authored skills before spending anything: a missing or
        # placeholder skill file must fail here, not after an API call.
        system = SKILLS.system()
        instructions = build_instructions(intent, len(sources))

        contents = [await self._content_for(source) for source in sources]
        # A typed topic is not a document: no grounding tools, no reflection
        # pass, and the compact prompt — the full machinery stays for uploads.
        topic_mode = all(item.get("type") == "input_text" for item in contents) and (
            sum(len(item.get("text", "")) for item in contents) < TOPIC_SOURCE_LIMIT
        )
        if topic_mode:
            system = _TOPIC_SYSTEM
        contents.append({"type": "input_text", "text": instructions})

        history: list = [{"role": "user", "content": contents}]
        findings = FindingLog()
        run_tools: list = [] if topic_mode else TOOLS

        # The root span carries the direction, because the first question about a
        # bad brief is always "what was it asked for" — and the skills version,
        # because comparing two prompt revisions is the reason this is here.
        with tracing.span(
            "intake",
            input={
                "audience": intent.audience,
                "depth": intent.depth,
                "runtime_mode": intent.runtime_mode,
                "target_duration_seconds": intent.target_duration_seconds,
                "narration_style": intent.narration_style,
                "creative_brief": intent.creative_brief,
            },
            metadata={
                "skills_version": SKILLS.version,
                "tools_version": TOOLS_VERSION,
                "model": self.model,
                "sources": [source.filename for source in sources],
                "mode": "topic" if topic_mode else "source",
            },
        ) as run:
            draft, input_tokens, output_tokens, turns = await self._converse(
                "draft", system, history, findings, run_tools
            )

            # Reflection is opt-in. With no reflection.md the department publishes
            # its first draft. record_finding stays declared for this turn too, so
            # a claim the revision introduces still has to be grounded first.
            critique = None if topic_mode else SKILLS.reflection()
            reflection: dict = {"ran": False}
            if critique:
                findings_before = len(findings.entries)
                history.append(
                    {"role": "user", "content": [{"type": "input_text", "text": critique}]}
                )
                second, extra_in, extra_out, extra_turns = await self._converse(
                    "reflection", system, history, findings, run_tools
                )
                # Which fields moved, not just whether any did. An unchanged brief
                # is the reflection prompt's own stated preference when the draft
                # is already right, so a bare `revised: false` cannot distinguish
                # a turn that found nothing from one that was never worth its
                # cost. The field list is what makes that judgeable later.
                before, after = draft.model_dump(), second.model_dump()
                reflection = {
                    "ran": True,
                    "changed_fields": sorted(k for k in after if before[k] != after[k]),
                    "findings_added": len(findings.entries) - findings_before,
                    "input_tokens": extra_in,
                    "output_tokens": extra_out,
                }
                draft = second
                input_tokens += extra_in
                output_tokens += extra_out
                turns += extra_turns

            # What the department decided, not what it wrote: the scope calls and
            # whether reflection earned its second generation.
            run.update(
                output={
                    "title": draft.title,
                    "scope_in": draft.scope_in,
                    "scope_out": draft.scope_out,
                    "open_questions": draft.open_questions,
                    "concepts": [concept.name for concept in draft.key_concepts],
                    "reflection": reflection,
                    "turns": turns,
                }
            )

        self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)

        return ProductionBrief(
            **draft.model_dump(),
            source_findings={
                # Never claim more than the run actually did.
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                "tools_version": TOOLS_VERSION,
                "source_count": len(sources),
                "total_bytes": sum(s.size_bytes for s in sources),
                "sources": [
                    {"filename": s.filename, "sha256": s.sha256, "media_type": s.media_type}
                    for s in sources
                ],
                "findings": findings.entries,
                "reflection": reflection,
                "note": (
                    "Findings were recorded by the Intake department while reading the "
                    "attached sources. Locators are the model's own citations and have "
                    "not been machine-verified against the document."
                ),
            },
        )


def build(settings: Settings) -> ModelIntake:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_INTAKE=openai")
    return ModelIntake(settings, object_store(settings))
