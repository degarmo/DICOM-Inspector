from __future__ import annotations

import json
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

import make_fixtures

sys.path.insert(0, str(Path(__file__).resolve().parent / "scenarios"))
from build_scenarios import build_pair, load_specs  # noqa: E402
from dicom_inspector.cli import main

ENGINE_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def fixtures() -> dict[str, make_fixtures.Pair]:
    """Regenerate every synthetic fixture pair once per test session."""
    return make_fixtures.build_all(make_fixtures.FIXTURE_DIR)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--update-goldens",
        action="store_true",
        help="Rewrite tests/scenarios/goldens/*.json from the current engine output.",
    )


def pytest_report_header(config: pytest.Config) -> str:
    from test_goldens import ENGINES, FROZEN_EXE

    if "frozen" in ENGINES:
        return f"golden tests: python engine and frozen engine ({FROZEN_EXE})"
    return f"golden tests: python engine only (frozen engine not built at {FROZEN_EXE})"


@pytest.fixture(scope="session")
def update_goldens(request: pytest.FixtureRequest) -> bool:
    return bool(request.config.getoption("--update-goldens"))


@pytest.fixture(scope="session")
def scenario_pairs(tmp_path_factory) -> dict[str, tuple[Path, Path]]:
    """Generate every scenario pair (tests/scenarios/specs) once per session."""
    out = tmp_path_factory.mktemp("scenarios")
    return {spec["name"]: build_pair(spec, out) for spec in load_specs()}


@pytest.fixture
def run_cli(capsys: pytest.CaptureFixture[str]) -> Callable[..., tuple[int, str, str]]:
    """Run the CLI in-process; return ``(exit_code, stdout, stderr)``."""

    def _run(*args: str) -> tuple[int, str, str]:
        code = main(list(args))
        captured = capsys.readouterr()
        return code, captured.out, captured.err

    return _run


@pytest.fixture
def compare_case(fixtures, run_cli) -> Callable[..., dict]:
    """Compare a fixture pair through the CLI and return the parsed report."""

    def _compare(case: str, *flags: str) -> dict:
        a, b = fixtures[case]
        code, out, err = run_cli("compare", str(a), str(b), *flags)
        assert code == 0, err
        assert err == ""
        return json.loads(out)

    return _compare


def non_identical(report: dict) -> dict[str, dict]:
    return {row["path"]: row for row in report["rows"] if row["status"] != "identical"}
