"""Regression tests for engine bugs found by the Phase 4 scenario and robustness suites."""

from __future__ import annotations

from pathlib import Path

import pytest

from dicom_inspector.cli import run_compare
from dicom_inspector.loader import LoadError, load
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


def _encodings(tmp_path: Path) -> dict[str, Path]:
    from pydicom.uid import ExplicitVRBigEndian, ImplicitVRLittleEndian

    from build_scenarios import baseline as nm_baseline

    undefined = nm_baseline()
    for keyword in ("ReferencedStudySequence", "RequestAttributesSequence", "EnergyWindowInformationSequence"):
        undefined[keyword].value.is_undefined_length = True
        for item in undefined[keyword].value:
            item.is_undefined_length_sequence_item = True
    return {
        "explicit_le": write(nm_baseline(), tmp_path / "explicit.dcm"),
        "implicit_le": write(nm_baseline(), tmp_path / "implicit.dcm", ImplicitVRLittleEndian),
        "explicit_be": write(nm_baseline(), tmp_path / "big.dcm", ExplicitVRBigEndian),
        "undefined_length_sequences": write(undefined, tmp_path / "undefined.dcm"),
    }


# Loading cut-off files directly (outside the CLI, which records reader warnings
# in its JSON) makes pydicom warn about half-read values; that is expected here.
@pytest.mark.filterwarnings("ignore::UserWarning")
@pytest.mark.parametrize("encoding", ["explicit_le", "implicit_le", "explicit_be", "undefined_length_sequences"])
def test_truncated_files_are_rejected_or_compared_faithfully(tmp_path, encoding):
    """Bug 2: pydicom stops silently at end of file, so a cut-off file compared as
    if complete, with partial values reported as plain differences.

    At every cut position the file must either be rejected (exit 2), or, when the
    cut falls exactly between two elements (a structurally valid shorter file),
    compare as a faithful prefix: earlier elements identical, the rest only_in_a.
    """
    complete = _encodings(tmp_path)[encoding]
    data = complete.read_bytes()
    cut = tmp_path / "cut.dcm"
    rejected = accepted = 0
    for length in range(len(data)):
        cut.write_bytes(data[:length])
        for force in (False, True):
            try:
                load(str(cut), force=force)
            except LoadError as error:
                assert error.code in ("not_dicom", "invalid_dicom")
                rejected += 1
                continue
            accepted += 1
            statuses = [row.status for row in run_compare(str(complete), str(cut), force=force).rows]
            first_missing = statuses.index("only_in_a") if "only_in_a" in statuses else len(statuses)
            assert set(statuses[:first_missing]) == {"identical"}, f"cut at {length}: {statuses}"
            assert set(statuses[first_missing:]) <= {"only_in_a"}, f"cut at {length}: {statuses}"
    assert rejected > 0.95 * (rejected + accepted)


def test_forced_read_of_zero_bytes_is_not_dicom(tmp_path):
    """Bug 3: zero bytes parse as (0000,0000) command-group elements, which are in
    the DICOM dictionary, so a forced read of a cut-off preamble passed as DICOM."""
    zeros = tmp_path / "zeros.dcm"
    zeros.write_bytes(bytes(64))
    with pytest.raises(LoadError) as error:
        load(str(zeros), force=True)
    assert error.value.code == "not_dicom"
