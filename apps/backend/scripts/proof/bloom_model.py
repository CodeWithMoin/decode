"""The MODEL — a real, tested Bloom filter. The trace it emits is the ground
truth every scene is bound to. Correctness lives here (testable code), not in a
diagram. Run directly for the self-check: `uv run python scripts/proof/bloom_model.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

SEEDS = (0x9E3779B1, 0x85EBCA77, 0xC2B2AE3D)  # three "hash functions"


def _hash(item: str, seed: int, m: int) -> int:
    h = seed & 0xFFFFFFFF
    for ch in item:
        h = (h * 33 + ord(ch)) & 0xFFFFFFFF
    return h % m


@dataclass
class Bloom:
    m: int = 10
    seeds: tuple[int, ...] = SEEDS
    bits: list[int] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.bits:
            self.bits = [0] * self.m

    def indices(self, item: str) -> list[int]:
        return [_hash(item, s, self.m) for s in self.seeds]

    def add(self, item: str) -> list[int]:
        ix = self.indices(item)
        for i in ix:
            self.bits[i] = 1
        return ix

    def query(self, item: str) -> tuple[list[int], list[int], bool]:
        ix = self.indices(item)
        read = [self.bits[i] for i in ix]
        return ix, read, all(read)


# A small candidate pool to DISCOVER a real false positive by running the model —
# never hand-picked. If none collide we say so rather than fabricate one.
_CANDIDATES = [
    "cat", "dog", "bird", "fish", "lion", "wolf", "bear", "frog", "duck", "mole",
    "hawk", "crab", "newt", "toad", "seal", "swan", "goat", "deer", "moth", "worm",
]


def run_trace(add: list[str], m: int = 10) -> dict:
    """Add the items, then query candidates until we find (a) a definite-no and
    (b) a real false positive. Everything returned is computed, not scripted."""
    bloom = Bloom(m=m)
    steps: list[dict] = []
    for item in add:
        ix = bloom.add(item)
        steps.append(
            {"op": "add", "item": item, "indices": ix, "bits_after": list(bloom.bits)}
        )

    added = set(add)
    definite_no: dict | None = None
    false_positive: dict | None = None
    for cand in _CANDIDATES:
        if cand in added:
            continue
        ix, read, present = bloom.query(cand)
        record = {
            "op": "query",
            "item": cand,
            "indices": ix,
            "read": read,
            "present": present,
            "truth": "absent",
            "false_positive": present,  # present but never added
        }
        if present and false_positive is None:
            false_positive = record
        if not present and definite_no is None:
            definite_no = record
        if false_positive and definite_no:
            break

    for record in (definite_no, false_positive):
        if record is not None:
            steps.append(record)

    return {
        "m": m,
        "added": list(add),
        "final_bits": list(bloom.bits),
        "definite_no": definite_no,
        "false_positive": false_positive,
        "steps": steps,
    }


# A realistically-filled filter (2 items in 10 bits is underfull and correctly
# never false-positives — so we hold several items, which is when the tradeoff bites).
DEMO_ADD = ["geeks", "nerd", "filter", "hash"]


def _selfcheck() -> None:
    trace = run_trace(DEMO_ADD)
    bloom = Bloom(m=trace["m"])
    for item in trace["added"]:
        bloom.add(item)
    # Invariant: no false negatives — every added item must read present.
    for item in trace["added"]:
        _, _, present = bloom.query(item)
        assert present, f"false negative on {item!r} — model is broken"
    assert trace["false_positive"] is not None, "expected to find a false positive"
    assert trace["definite_no"] is not None, "expected to find a definite-no"
    fp = trace["false_positive"]
    assert all(fp["read"]) and fp["truth"] == "absent"
    print("selfcheck OK — no false negatives; invariants hold")
    print(f"  added geeks, nerd -> bits {trace['final_bits']}")
    print(f"  definite-no    : {trace['definite_no']['item']} -> reads {trace['definite_no']['read']}")
    print(f"  false-positive : {fp['item']} -> indices {fp['indices']} all set, never added")


if __name__ == "__main__":
    _selfcheck()
