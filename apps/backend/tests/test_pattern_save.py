import pytest

from decode.agents.renderer import patterns

GOOD = (
    "import { AbsoluteFill } from '@decode/animation-api';\n"
    "export default function Scene({ words }) { return <AbsoluteFill />; }\n"
)


@pytest.fixture
def seeds(tmp_path, monkeypatch):
    monkeypatch.setattr(patterns, "_SEEDS_DIR", tmp_path)
    return tmp_path


def test_save_stamps_header_and_registers(seeds):
    path = patterns.save("loss-curve-demo", "a loss curve that draws on", GOOD)
    header = path.read_text().splitlines()[0]
    assert header == "// SEED · loss-curve-demo — a loss curve that draws on"
    assert "loss-curve-demo" in patterns.available()
    assert patterns.get("loss-curve-demo") == path.read_text()  # retrievable


def test_dedupe_then_force(seeds):
    patterns.save("dup", "first", GOOD)
    with pytest.raises(ValueError):
        patterns.save("dup", "second", GOOD)
    patterns.save("dup", "second", GOOD, force=True)  # overwrite allowed
    assert "second" in patterns.get("dup")


def test_replaces_existing_seed_header(seeds):
    src = "// SEED · old — old desc\n" + GOOD
    path = patterns.save("newname", "new desc", src)
    first = path.read_text().splitlines()[0]
    assert first == "// SEED · newname — new desc"  # not doubled, old header replaced


def test_rejects_bad_input(seeds):
    with pytest.raises(ValueError):
        patterns.save("Bad Name", "d", GOOD)  # not kebab
    with pytest.raises(ValueError):
        patterns.save("ok", "", GOOD)  # empty desc
    with pytest.raises(ValueError):
        patterns.save("ok", "d", "const x = 1;")  # not a Scene module
