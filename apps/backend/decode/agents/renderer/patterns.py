"""The animation pattern library — the seeds as a FIRST-CLASS library the model
searches and retrieves from (deliberately NOT the skills system: a pattern is a
scene template, not a department's craft).

Each seed is self-describing: its first comment line
`// SEED · <name> — <description>` supplies the catalog entry, so the library is
generated from the files — one source of truth, no separate manifest to drift.
The model reads the catalog (one line per pattern), picks one, and calls
`retrieve_pattern` to pull its full source to edit. `search_patterns` narrows the
menu; at scale that query becomes the RAG entry point without changing this API.
"""

from __future__ import annotations

import re
from pathlib import Path

_SEEDS_DIR = Path(__file__).parent / "seeds"
_HEADER = re.compile(r"//\s*SEED\s*[·.]\s*([\w-]+)\s*[—–-]+\s*(.+)")


def _norm(name: str) -> str:
    return name.strip().lower().replace("_", "-")


def _entries() -> list[tuple[str, str, str]]:
    """`(name, description, source)` per seed. Re-read each call so editing a seed
    needs no restart."""
    out: list[tuple[str, str, str]] = []
    if not _SEEDS_DIR.is_dir():
        return out
    for path in sorted(_SEEDS_DIR.glob("*.tsx")):
        source = path.read_text()
        first = source.splitlines()[0].strip() if source else ""
        match = _HEADER.match(first)
        description = match.group(2).strip() if match else path.stem
        out.append((path.stem, description, source))
    return out


def available() -> list[str]:
    return [name for name, _, _ in _entries()]


def catalog_lines() -> str:
    """One line per pattern for the prompt menu."""
    return "\n".join(f"- `{name}` — {desc}" for name, desc, _ in _entries())


def search(query: str, limit: int = 8) -> list[dict]:
    """Rank patterns by keyword overlap with the query (name + description). A
    deliberately simple recall step now; the seam where RAG slots in later."""
    terms = [t for t in re.split(r"[^a-z0-9]+", _norm(query)) if t]
    scored: list[tuple[int, str, str]] = []
    for name, desc, _ in _entries():
        hay = f"{name} {desc}".lower()
        score = sum(1 for t in terms if t in hay)
        if score:
            scored.append((score, name, desc))
    scored.sort(key=lambda s: (-s[0], s[1]))
    hits = scored[:limit] if scored else [(0, n, d) for n, d, _ in _entries()][:limit]
    return [{"name": n, "description": d} for _, n, d in hits]


def get(name: str) -> str | None:
    """A pattern's full source, forgiving of case and `_`/`-`; None if unknown."""
    target = _norm(name)
    for seed, _, source in _entries():
        if _norm(seed) == target:
            return source
    return None


_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def save(name: str, description: str, source: str, *, force: bool = False) -> Path:
    """Write one good build back into the shared library as a new seed — the
    self-growing step. The library is file-driven, so a well-formed file IS the
    only registration: `_entries()` catalogs it on the next read, and every future
    generation can retrieve it. The caller gates on quality (vision-pass); this
    just distils a concrete scene into a seed by stamping the `// SEED · …` header.

    Raises ValueError on a bad name, empty description, a source that is not a
    Scene module, or a name collision (unless `force`, which overwrites).
    """
    slug = _norm(name)
    if not _NAME_RE.match(slug):
        raise ValueError(f"pattern name must be kebab-case [a-z0-9-]: {name!r}")
    description = description.strip()
    if not description:
        raise ValueError("a pattern needs a one-line description (the catalog entry)")
    if "export default function Scene" not in source:
        raise ValueError("a seed must default-export `function Scene({ words })`")
    if not force and slug in {_norm(n) for n in available()}:
        raise ValueError(f"pattern {slug!r} already exists; pass force=True to overwrite")

    header = f"// SEED · {slug} — {description}"
    lines = source.splitlines()
    # Replace an existing SEED header line, else prepend ours, so the FIRST line is
    # always the catalog entry `_entries()` reads.
    if lines and _HEADER.match(lines[0].strip()):
        lines[0] = header
    else:
        lines.insert(0, header)
    seed_source = "\n".join(lines).rstrip() + "\n"
    if not _HEADER.match(seed_source.splitlines()[0].strip()):  # belt-and-braces
        raise ValueError("failed to stamp a valid SEED header")

    _SEEDS_DIR.mkdir(parents=True, exist_ok=True)
    path = _SEEDS_DIR / f"{slug}.tsx"
    path.write_text(seed_source)
    return path
