"""Golden-file tests: each scenario's full engine output must match goldens/<name>.json.

Runs against `python -m dicom_inspector` and, when it has been built, the frozen
engine in engine/dist/. Regenerate after an intended output change with:

    pytest tests/scenarios --update-goldens
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from build_scenarios import ENGINE_DIR, GOLDEN_DIR, load_specs

SPECS = load_specs()
FROZEN_EXE = ENGINE_DIR / "dist" / "dicom_inspector_engine" / (
    "dicom_inspector_engine.exe" if sys.platform == "win32" else "dicom_inspector_engine"
)
ENGINES = {"python": [sys.executable, "-m", "dicom_inspector"]}
if FROZEN_EXE.is_file():
    ENGINES["frozen"] = [str(FROZEN_EXE)]


def normalized_output(command: list[str], a: Path, b: Path) -> str:
    """Engine stdout (--pretty) with the machine-specific files.*.path values replaced."""
    result = subprocess.run(
        [*command, "compare", "--pretty", str(a), str(b)],
        cwd=ENGINE_DIR, capture_output=True, text=True, encoding="ascii", check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    report["files"]["a"]["path"] = "A.dcm"
    report["files"]["b"]["path"] = "B.dcm"
    return json.dumps(report, indent=2, ensure_ascii=True) + "\n"


@pytest.mark.parametrize("engine", list(ENGINES))
@pytest.mark.parametrize("spec", SPECS, ids=[s["name"] for s in SPECS])
def test_engine_output_matches_golden(spec, engine, scenario_pairs, update_goldens):
    a, b = scenario_pairs[spec["name"]]
    actual = normalized_output(ENGINES[engine], a, b)
    golden = GOLDEN_DIR / f"{spec['name']}.json"
    if update_goldens and engine == "python":
        golden.write_text(actual, encoding="ascii", newline="\n")
    assert golden.is_file(), f"missing golden {golden.name}; run pytest --update-goldens"
    assert actual == golden.read_text(encoding="ascii"), (
        f"{golden.name} is stale for the {engine} engine; if the change is intended, run pytest --update-goldens"
    )


def test_every_scenario_has_exactly_one_golden():
    goldens = {path.stem for path in GOLDEN_DIR.glob("*.json")}
    specs = {spec["name"] for spec in SPECS}
    assert goldens == specs, f"missing: {sorted(specs - goldens)}, orphaned: {sorted(goldens - specs)}"


def test_goldens_follow_the_expected_rows():
    """A golden can only be regenerated into agreement with its spec, not past it."""
    for spec in SPECS:
        golden = json.loads((GOLDEN_DIR / f"{spec['name']}.json").read_text(encoding="ascii"))
        assert golden["schema_version"] == "1.0"
        differing = [row["path"] for row in golden["rows"] if row["status"] != "identical"]
        assert differing == [row["path"] for row in spec["expected"]["rows"]], spec["name"]
