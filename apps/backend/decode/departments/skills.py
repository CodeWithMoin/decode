"""Loads a department's SKILL.md. It does not author them.

The craft — what makes a good brief, how a plan earns its runtime — belongs to
the person directing the product, not to the code that runs it. Each department
is a folder that describes itself:

    SKILL.md         YAML frontmatter, then the standing system prompt
    instructions.md  per-run template; placeholders are substituted
    reflection.md    optional; a placeholder here means no revision turn
    references/      detail read on demand, once a section is big enough to pay

The frontmatter is the manifest. Keeping it in the same file as the prose means
editing a prompt and bumping its version are one edit, not two that can drift —
and `version` is recorded on every artifact the department publishes, so output
can always be traced to the skills that produced it.

References are supported and deliberately unused. At ~150 lines a system prompt
costs less to send whole than a round trip to fetch part of it. The first
section that genuinely applies to only one depth setting is what earns the
split, and a `read_reference` tool with it.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import yaml

PLACEHOLDER = "TODO: written by the product owner, not generated."


@dataclass(frozen=True)
class Manifest:
    """What a department declares about itself.

    Display metadata is deliberately absent. `crew_role` points at the crew,
    where the name, initial and colour live — eight departments present as five
    crew roles, and duplicating the labels here would let the two disagree.
    """

    name: str
    version: str
    description: str
    crew_role: str
    produces: str
    consumes: tuple[str, ...]
    tools: tuple[str, ...]
    max_turns: int
    provider_setting: str
    progress_step: str
    schema_version: int

    @property
    def job_kind(self) -> str:
        return f"generate_{self.produces}"

    @property
    def label(self) -> str:
        """Creator-facing name — "Teaching Plan", never "teaching_plan"."""
        return self.produces.replace("_", " ").title()


class SkillSet:
    """One department's folder, read from disk.

    The markdown is re-read on every call so editing a prompt and re-running
    needs no restart. The manifest is cached because it is structure rather than
    craft, and the registry reads it while building the stage table.
    """

    def __init__(self, directory: Path):
        self.directory = directory

    @property
    def skill_path(self) -> Path:
        return self.directory / "SKILL.md"

    def _split(self) -> tuple[dict, str]:
        """Frontmatter and body, or a loud failure naming the file."""
        if not self.skill_path.exists():
            raise FileNotFoundError(
                f"Skill file missing: {self.skill_path}. The department cannot run without it."
            )
        raw = self.skill_path.read_text()
        if not raw.startswith("---\n"):
            raise ValueError(f"{self.skill_path.name} has no YAML frontmatter.")
        _, front, body = raw.split("---\n", 2)
        return yaml.safe_load(front) or {}, body.strip()

    @cached_property
    def manifest(self) -> Manifest:
        front, _ = self._split()
        try:
            return Manifest(
                name=front["name"],
                version=front["version"],
                description=front["description"].strip(),
                crew_role=front["crew_role"],
                produces=front["produces"],
                consumes=tuple(front["consumes"]),
                tools=tuple(front.get("tools") or ()),
                max_turns=int(front["max_turns"]),
                provider_setting=front["provider_setting"],
                progress_step=front["progress_step"],
                schema_version=int(front.get("schema_version", 1)),
            )
        except KeyError as exc:
            raise ValueError(f"{self.skill_path.name} frontmatter is missing {exc}.") from exc

    @property
    def version(self) -> str:
        return self.manifest.version

    def system(self) -> str:
        """The standing system prompt: everything after the frontmatter."""
        _, body = self._split()
        if not body or PLACEHOLDER in body:
            raise ValueError(
                f"{self.skill_path.name} is still a placeholder. "
                "Write the department's actual instructions before enabling a real provider."
            )
        return body

    def _read(self, path: Path) -> str:
        if not path.exists():
            raise FileNotFoundError(
                f"Skill file missing: {path}. The department cannot run without it."
            )
        content = path.read_text().strip()
        if not content or PLACEHOLDER in content:
            raise ValueError(
                f"Skill file {path.name} is still a placeholder. "
                "Write the department's actual instructions before enabling a real provider."
            )
        return content

    def instructions(self, **values: object) -> str:
        """This run's assignment, with the creator's direction substituted in.

        Named for the file, not for OpenAI's `instructions=` parameter, which
        confusingly carries the *other* one — SKILL.md's body.
        """
        return self._read(self.directory / "instructions.md").format(**values)

    def reflection(self) -> str | None:
        """The revision turn's prompt, or None to skip it.

        Optional where the other two are not: a department that publishes its
        first draft is still coherent, so an absent or untouched file means no
        reflection rather than a hard failure.
        """
        path = self.directory / "reflection.md"
        if not path.exists():
            return None
        content = path.read_text().strip()
        return None if not content or PLACEHOLDER in content else content

    def reference(self, name: str) -> str:
        """One detail file, read on demand."""
        return self._read(self.directory / "references" / f"{name}.md")
