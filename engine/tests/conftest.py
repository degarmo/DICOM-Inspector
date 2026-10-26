from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import pytest

import make_fixtures
from dicom_inspector.cli import main

ENGINE_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def fixtures() -> dict[str, make_fixtures.Pair]:
    """Regenerate every synthetic fixture pair once per test session."""
    return make_fixtures.build_all(make_fixtures.FIXTURE_DIR)


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
