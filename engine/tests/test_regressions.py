"""Regression tests for engine bugs found by the Phase 4 scenario and robustness suites."""

from __future__ import annotations

from dicom_inspector.cli import run_compare
from make_fixtures import baseline, write


def test_same_private_tag_under_a_different_creator_is_different(tmp_path):
    """Bug 1: identical private values under different private creators compared as identical."""
    a = baseline()
    a.private_block(0x0019, "SYNTH_VENDOR_01", create=True).add_new(0x01, "LO", "SAME VALUE")
    b = baseline()
    b.private_block(0x0019, "SYNTH_VENDOR_02", create=True).add_new(0x01, "LO", "SAME VALUE")
    report = run_compare(str(write(a, tmp_path / "a.dcm")), str(write(b, tmp_path / "b.dcm")), only_diffs=True)
    rows = {row.path: row for row in report.rows}

    assert set(rows) == {"(0019,0010)", "(0019,1001)"}
    data = rows["(0019,1001)"]
    assert data.status == "different"
    assert data.value_a == data.value_b == "SAME VALUE"
    assert data.vr_mismatch is False
    assert data.is_priority is True
