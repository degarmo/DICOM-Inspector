"""CLI flags, exit codes, stdout/stderr contract and determinism."""

from __future__ import annotations

import json
import os
import subprocess
import sys

from conftest import ENGINE_DIR
from make_fixtures import NON_ASCII_NAME

import dicom_inspector.cli as cli


def run_module(*args: str) -> subprocess.CompletedProcess[bytes]:
    env = {**os.environ, "PYTHONPATH": str(ENGINE_DIR)}
    return subprocess.run(
        [sys.executable, "-m", "dicom_inspector", *args],
        capture_output=True,
        env=env,
        check=False,
    )


def test_module_entry_point_end_to_end(fixtures):
    a, b = fixtures["01_study_uid"]
    result = run_module("compare", str(a), str(b))
    assert result.returncode == 0
    assert result.stderr == b""
    report = json.loads(result.stdout)
    assert report["schema_version"] == "1.0"
    assert list(report) == ["schema_version", "files", "summary", "warnings", "rows"]
    assert set(report["files"]["a"]) == {"path", "size_bytes", "sha256", "transfer_syntax", "sop_class"}
    assert report["files"]["a"]["sop_class"] == {
        "uid": "1.2.840.10008.5.1.4.1.1.7",
        "name": "Secondary Capture Image Storage",
    }
    assert report["files"]["a"]["size_bytes"] == a.stat().st_size


def test_output_is_deterministic(fixtures):
    a, b = fixtures["05_private_block"]
    for flags in ([], ["--pretty"], ["--only-diffs"]):
        first = run_module("compare", str(a), str(b), *flags)
        second = run_module("compare", str(a), str(b), *flags)
        assert first.returncode == second.returncode == 0
        assert first.stdout == second.stdout
        json.loads(first.stdout)


def test_output_is_ascii_only(fixtures):
    a, b = fixtures["04_charset"]
    result = run_module("compare", str(a), str(b))
    assert result.stdout.isascii()
    assert b"T\\u00cbST" in result.stdout
    report = json.loads(result.stdout)
    name = next(r for r in report["rows"] if r["keyword"] == "PatientName")
    assert name["value_a"] == NON_ASCII_NAME


def test_rows_sorted_by_path(compare_case):
    report = compare_case("06_nested_sequence")
    paths = [row["path"] for row in report["rows"]]
    assert paths[0].startswith("(0002,")
    assert paths.index("(0008,1115)") < paths.index("(0008,1115)[0].(0008,114A)")
    assert paths.index("(0008,1115)[0].(0020,000E)") < paths.index("(0010,0010)")


def test_only_diffs_drops_identical_rows(compare_case):
    full = compare_case("01_study_uid")
    only = compare_case("01_study_uid", "--only-diffs")
    assert [r["path"] for r in only["rows"]] == ["(0020,000D)"]
    assert only["summary"] == full["summary"]
    assert len(full["rows"]) == full["summary"]["total"]


def test_pretty_is_indented_and_equivalent(fixtures, run_cli):
    a, b = fixtures["01_study_uid"]
    _, compact, _ = run_cli("compare", str(a), str(b))
    _, pretty, _ = run_cli("compare", str(a), str(b), "--pretty")
    assert "\n" not in compact.rstrip("\n")
    assert pretty.startswith('{\n  "schema_version": "1.0",')
    assert json.loads(pretty) == json.loads(compact)


def test_force_reads_file_without_preamble(fixtures, run_cli):
    a, b = fixtures["10_no_preamble"]

    code, out, err = run_cli("compare", str(a), str(b))
    assert code == 2
    assert out == ""
    assert json.loads(err) == {
        "error": {
            "code": "not_dicom",
            "message": "File is missing the DICOM preamble and 'DICM' prefix. "
            "If it is a raw DICOM dataset, re-run with --force.",
            "file": str(b),
        }
    }

    code, out, err = run_cli("compare", str(a), str(b), "--force")
    assert code == 0, err
    report = json.loads(out)
    diffs = [r for r in report["rows"] if r["status"] != "identical"]
    # B has no file meta at all; the datasets themselves are identical.
    assert diffs and all(r["status"] == "only_in_a" for r in diffs)
    assert all(r["path"].startswith("(0002,") for r in diffs)
    assert report["files"]["b"]["transfer_syntax"] is None
    assert report["files"]["b"]["sop_class"]["uid"] == "1.2.840.10008.5.1.4.1.1.7"


def test_missing_file_exits_2(fixtures, run_cli, tmp_path):
    a, _ = fixtures["08_identical"]
    missing = tmp_path / "missing.dcm"
    code, out, err = run_cli("compare", str(a), str(missing))
    assert code == 2
    assert out == ""
    assert json.loads(err)["error"] == {
        "code": "file_not_found",
        "message": f"File not found: {missing}",
        "file": str(missing),
    }


def test_directory_exits_2(fixtures, run_cli, tmp_path):
    a, _ = fixtures["08_identical"]
    code, _, err = run_cli("compare", str(tmp_path), str(a))
    assert code == 2
    assert json.loads(err)["error"]["code"] == "not_a_file"


def test_usage_error_is_json_and_exits_1(run_cli):
    code, out, err = run_cli("compare", "only-one-file.dcm")
    assert code == 1
    assert out == ""
    assert json.loads(err)["error"]["code"] == "usage_error"

    code, _, err = run_cli("explode")
    assert code == 1
    assert json.loads(err)["error"]["code"] == "usage_error"


def test_unexpected_error_exits_1(fixtures, run_cli, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("synthetic failure")

    monkeypatch.setattr(cli, "compare", boom)
    a, b = fixtures["08_identical"]
    code, out, err = run_cli("compare", str(a), str(b))
    assert code == 1
    assert out == ""
    assert json.loads(err)["error"] == {
        "code": "internal_error",
        "message": "RuntimeError: synthetic failure",
        "file": None,
    }
