"""Intake's tools.

One tool, deliberately. `record_finding` is the department's grounding
mechanism: it is how a claim in the brief gets tied to the page it came from,
which is what lets the UI stop calling the result a sample.

There is no read_source or search_source yet because the sources are attached to
the request directly — the model already has them, including figures, which
matter for a technical paper. Those tools become necessary when a project's
sources outgrow the context window, and that is a measurable moment rather than
a guess.
"""

from dataclasses import dataclass, field

from openai.types.responses import FunctionToolParam

TOOLS_VERSION = "intake-tools-v1"

# The description is model-facing craft, not engineering. Owned by the product
# owner alongside the skills; revise it there rather than treating it as code.
RECORD_FINDING: FunctionToolParam = {
    "type": "function",
    "name": "record_finding",
    "description": (
        "Record one claim from the source material that shapes this brief, with "
        "where it came from. Call this as you read, before writing the brief."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "claim": {
                "type": "string",
                "description": "The finding, in your own words, in one or two sentences.",
            },
            "source_filename": {
                "type": "string",
                "description": "Filename of the source this came from, exactly as attached.",
            },
            "locator": {
                "type": "string",
                "description": (
                    "Where in that source, as specifically as you can: a page number, "
                    "section heading, or figure label."
                ),
            },
            "shapes": {
                "type": "string",
                "enum": ["concept", "objective", "prerequisite", "scope", "teaching"],
                "description": "Which part of the brief this finding informs.",
            },
        },
        "required": ["claim", "source_filename", "locator", "shapes"],
        "additionalProperties": False,
    },
}

TOOLS: list[FunctionToolParam] = [RECORD_FINDING]


@dataclass
class FindingLog:
    """Collects what the agent recorded during one run."""

    entries: list[dict] = field(default_factory=list)

    def record(self, arguments: dict) -> str:
        self.entries.append(
            {
                "claim": arguments["claim"],
                "source_filename": arguments["source_filename"],
                "locator": arguments["locator"],
                "shapes": arguments["shapes"],
            }
        )
        return "recorded"

    def dispatch(self, name: str, arguments: dict) -> str:
        if name == "record_finding":
            return self.record(arguments)
        # Never silently succeed: a tool the department did not declare means the
        # prompt and the tool list have drifted apart.
        raise ValueError(f"intake called an unknown tool: {name!r}")
