"""Every scenario must produce exactly the diff rows and warnings its spec expects."""

from __future__ import annotations

from pathlib import Path

import pytest

from build_scenarios import load_specs
from dicom_inspector.cli import run_compare

SPECS = load_specs()


def test_all_twenty_scenarios_are_defined():
    names = [spec["name"] for spec in SPECS]
    assert len(names) == 20
    assert [name[:2] for name in names] == [f"{i:02d}" for i in range(1, 21)]


@pytest.mark.parametrize("spec", SPECS, ids=[s["name"] for s in SPECS])
def test_scenario_reports_exactly_the_planted_changes(spec, scenario_pairs):
    a, b = scenario_pairs[spec["name"]]
    report = run_compare(str(a), str(b)).to_dict()

    actual = {
        row["path"]: {"status": row["status"], "is_priority": row["is_priority"], "vr_mismatch": row["vr_mismatch"]}
        for row in report["rows"]
        if row["status"] != "identical"
    }
    expected = {
        row["path"]: {"status": row["status"], "is_priority": row["is_priority"], "vr_mismatch": row.get("vr_mismatch", False)}
        for row in spec["expected"]["rows"]
    }
    assert actual == expected
    assert [(w["code"], w["file"], w["path"]) for w in report["warnings"]] == [
        (w["code"], w["file"], w["path"]) for w in spec["expected"]["warnings"]
    ]
    for actual_warning, expected_warning in zip(report["warnings"], spec["expected"]["warnings"]):
        assert expected_warning.get("message_contains", "") in actual_warning["message"]
    summary = report["summary"]
    assert summary["total"] - summary["identical"] == len(expected)
    assert summary["priority_mismatches"] == sum(1 for row in expected.values() if row["is_priority"])


def test_baseline_is_a_valid_nm_rest_study(scenario_pairs):
    a, _ = scenario_pairs["20_identical"]
    report = run_compare(str(a), str(a)).to_dict()
    values = {row["keyword_path"]: row["value_a"] for row in report["rows"]}
    assert report["files"]["a"]["sop_class"]["name"] == "Nuclear Medicine Image Storage"
    assert values["Modality"] == "NM"
    assert values["PatientName"] == "TEST^CARDIO^SYNTH"
    assert values["InstitutionName"] == "Synthetic Test Hospital"
    assert values["SeriesDescription"] == "REST TOMO"
    assert values["RelatedSeriesSequence[0].SeriesInstanceUID"] == "2.25.4200"
    assert values["(0019,0010)"] == "SYNTH_VENDOR_01"
    assert len(report["rows"]) >= 80
    assert report["warnings"] == []
