"""Each fixture pair has exactly one planted difference; nothing else may differ."""

from __future__ import annotations

import json

from conftest import non_identical
from make_fixtures import NON_ASCII_NAME, PRIVATE_CREATOR, long_comment


def assert_single_diff(report: dict, path: str, **expected) -> dict:
    diffs = non_identical(report)
    assert list(diffs) == [path]
    row = diffs[path]
    for key, value in expected.items():
        assert row[key] == value, key
    assert report["warnings"] == []
    return row


def test_01_changed_study_instance_uid(compare_case):
    report = compare_case("01_study_uid")
    assert_single_diff(
        report,
        "(0020,000D)",
        keyword="StudyInstanceUID",
        keyword_path="StudyInstanceUID",
        tag="(0020,000D)",
        vr="UI",
        value_a="2.25.1000",
        value_b="2.25.1999",
        status="different",
        is_priority=True,
        is_private=False,
        private_creator=None,
        vr_mismatch=False,
    )
    assert report["summary"]["different"] == 1
    assert report["summary"]["priority_mismatches"] == 1


def test_02_blank_accession_number(compare_case):
    report = compare_case("02_blank_accession")
    assert_single_diff(
        report,
        "(0008,0050)",
        keyword="AccessionNumber",
        value_a="SYNACC0001",
        value_b="",
        status="different",
        is_priority=True,
    )


def test_03_different_issuer_of_patient_id(compare_case):
    report = compare_case("03_issuer")
    assert_single_diff(
        report,
        "(0010,0021)",
        keyword="IssuerOfPatientID",
        value_a="SYNTHETIC-ISSUER",
        value_b="OTHER-SYNTHETIC-ISSUER",
        status="different",
        is_priority=True,
    )


def test_04_specific_character_set_is_respected(fixtures, compare_case):
    a, b = fixtures["04_charset"]
    # The name really is encoded differently on disk...
    assert NON_ASCII_NAME.encode("latin-1") in a.read_bytes()
    assert NON_ASCII_NAME.encode("utf-8") in b.read_bytes()

    # ...but decodes to the same text, so only the charset itself differs.
    report = compare_case("04_charset")
    assert_single_diff(
        report,
        "(0008,0005)",
        keyword="SpecificCharacterSet",
        value_a="ISO_IR 100",
        value_b="ISO_IR 192",
        status="different",
        is_priority=True,
    )
    name = next(r for r in report["rows"] if r["keyword"] == "PatientName")
    assert name["status"] == "identical"
    assert name["value_a"] == name["value_b"] == NON_ASCII_NAME


def test_05_private_block_only_in_b(compare_case):
    report = compare_case("05_private_block")
    diffs = non_identical(report)
    assert list(diffs) == ["(0009,0010)", "(0009,1001)", "(0009,1002)", "(0009,1003)"]
    for row in diffs.values():
        assert row["status"] == "only_in_b"
        assert row["is_private"] is True
        assert row["is_priority"] is True
        assert row["private_creator"] == PRIVATE_CREATOR
        assert row["value_a"] is None
        assert row["vr_a"] is None
        assert row["keyword"] == ""
    assert diffs["(0009,0010)"]["value_b"] == PRIVATE_CREATOR
    assert diffs["(0009,1001)"]["value_b"] == "SYNTHETIC PRIVATE VALUE"
    assert diffs["(0009,1002)"]["value_b"] == "42"
    assert diffs["(0009,1003)"]["vr"] == "OB"
    assert diffs["(0009,1003)"]["value_b"] == "<16 bytes, sha256:be45cb2605bf>"
    assert report["summary"]["only_in_b"] == 4
    assert report["summary"]["priority_mismatches"] == 4
    assert report["warnings"] == []


def test_06_difference_nested_in_sequence(compare_case):
    report = compare_case("06_nested_sequence")
    assert_single_diff(
        report,
        "(0008,1115)[0].(0008,114A)[0].(0008,1155)",
        keyword_path="ReferencedSeriesSequence[0].ReferencedInstanceSequence[0]."
        "ReferencedSOPInstanceUID",
        keyword="ReferencedSOPInstanceUID",
        tag="(0008,1155)",
        value_a="2.25.3001",
        value_b="2.25.3002",
        status="different",
        is_priority=False,
    )
    rows = {r["path"]: r for r in report["rows"]}
    assert rows["(0008,1115)"]["value_a"] == "<1 item>"
    assert rows["(0008,1115)"]["status"] == "identical"
    # Priority is per tag, so a SeriesInstanceUID inside a sequence counts too.
    assert rows["(0008,1115)[0].(0020,000E)"]["is_priority"] is True


def test_07_different_transfer_syntax(compare_case):
    report = compare_case("07_transfer_syntax")
    assert_single_diff(
        report,
        "(0002,0010)",
        keyword="TransferSyntaxUID",
        value_a="1.2.840.10008.1.2.1",
        value_b="1.2.840.10008.1.2.2",
        status="different",
        is_priority=True,
    )
    assert report["files"]["a"]["transfer_syntax"]["name"] == "Explicit VR Little Endian"
    assert report["files"]["b"]["transfer_syntax"]["name"] == "Explicit VR Big Endian"


def test_08_identical_pair(compare_case):
    report = compare_case("08_identical")
    assert non_identical(report) == {}
    summary = report["summary"]
    assert summary["total"] == summary["identical"] > 0
    assert summary["different"] == summary["only_in_a"] == summary["only_in_b"] == 0
    assert summary["priority_mismatches"] == 0
    assert report["files"]["a"]["sha256"] == report["files"]["b"]["sha256"]
    assert report["warnings"] == []


def test_09_non_dicom_file_exits_2(fixtures, run_cli):
    a, b = fixtures["09_not_dicom"]
    for flags in ([], ["--force"]):
        code, out, err = run_cli("compare", str(a), str(b), *flags)
        assert code == 2
        assert out == ""
        error = json.loads(err)["error"]
        assert error["code"] == "not_dicom"
        assert error["file"] == str(b)


def test_mismatched_vr_is_different(compare_case):
    report = compare_case("11_vr_mismatch")
    assert_single_diff(
        report,
        "(0008,1030)",
        keyword="StudyDescription",
        value_a="SYNTHETIC STUDY",
        value_b="SYNTHETIC STUDY",
        status="different",
        vr="LO",
        vr_a="LO",
        vr_b="SH",
        vr_mismatch=True,
        is_priority=False,
    )


def test_long_values_truncated_but_compared_in_full(compare_case):
    report = compare_case("12_long_value")
    row = assert_single_diff(report, "(0020,4000)", keyword="ImageComments", status="different")
    # The change is past the display cutoff, so the rendered values match.
    expected = long_comment()[:256] + "…(+44 chars)"
    assert row["value_a"] == row["value_b"] == expected


def test_undecodable_text_becomes_bytes_summary_with_warning(compare_case):
    report = compare_case("13_decode_error")
    diffs = non_identical(report)
    assert list(diffs) == ["(0008,0005)", "(0010,0010)"]
    name = diffs["(0010,0010)"]
    assert name["status"] == "different"
    assert name["value_a"] == NON_ASCII_NAME
    assert name["value_b"].startswith(f"<{len(NON_ASCII_NAME)} bytes, sha256:")
    assert [(w["code"], w["file"], w["path"]) for w in report["warnings"]] == [
        ("decode_error", "b", "(0010,0010)")
    ]


def test_implicit_vs_explicit_vr(compare_case):
    report = compare_case("14_implicit_vr")
    diffs = non_identical(report)
    # The shorter Implicit VR UID also shrinks the file meta group length.
    assert list(diffs) == ["(0002,0000)", "(0002,0010)"]
    assert diffs["(0002,0010)"]["value_b"] == "1.2.840.10008.1.2"
    assert diffs["(0002,0010)"]["is_priority"] is True
    assert diffs["(0002,0000)"]["is_priority"] is False
