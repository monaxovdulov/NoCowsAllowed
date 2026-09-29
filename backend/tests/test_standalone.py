import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / "tools" / "build-standalone.py"


@pytest.mark.skipif(
    not BUILDER.exists(), reason="нет tools/ (например, в docker-образе)"
)
def test_standalone_is_fresh() -> None:
    spec = importlib.util.spec_from_file_location("build_standalone", BUILDER)
    assert spec and spec.loader
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    actual = (ROOT / "cow-skate-standalone.html").read_text(encoding="utf-8")
    assert actual == builder.build(), (
        "cow-skate-standalone.html устарел: make standalone"
    )
