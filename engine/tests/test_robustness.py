"""The engine on large, malformed and awkwardly named inputs."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

import pytest
from pydicom.dataset import Dataset
from pydicom.sequence import Sequence

from build_scenarios import baseline
from dicom_inspector.cli import run_compare
from make_fixtures import write

ENGINE_DIR = Path(__file__).resolve().parent.parent

# The compare budget on a normal laptop is 2 s; CI machines get a generous margin.
COMPARE_BUDGET_SECONDS = 2.0
CI_MARGIN = 3.0


def engine(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "dicom_inspector", *args],
        cwd=ENGINE_DIR, capture_output=True, text=True, encoding="utf-8", check=False,
    )


def large_dataset(changed_item: int | None = None) -> Dataset:
    """The NM baseline plus a 450-item referenced-image sequence: over 2,000 elements."""
    ds = baseline()
    items = []
    for index in range(450):
        item = Dataset()
        item.ReferencedSOPClassUID = "1.2.840.10008.5.1.4.1.1.20"
        item.ReferencedSOPInstanceUID = f"2.25.{50000 + index}"
        item.ReferencedFrameNumber = str(index % 64 + 1)
        purpose = Dataset()
        purpose.CodeValue = "SYN-REF"
        purpose.CodingSchemeDesignator = "99SYNTH"
        purpose.CodeMeaning = "Synthetic reference" if index != changed_item else "Synthetic reference (edited)"
        item.PurposeOfReferenceCodeSequence = Sequence([purpose])
        items.append(item)
    ds.ReferencedImageSequence = Sequence(items)
    return ds


def test_large_header_compares_within_budget(tmp_path):
    a = write(large_dataset(), tmp_path / "large_a.dcm")
    b = write(large_dataset(changed_item=399), tmp_path / "large_b.dcm")

    start = time.perf_counter()
    result = engine("compare", "--only-diffs", str(a), str(b))
    elapsed = time.perf_counter() - start

    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["summary"]["total"] >= 2000
    assert [row["path"] for row in report["rows"]] == ["(0008,1140)[399].(0040,A170)[0].(0008,0104)"]
    print(f"\nlarge header: {report['summary']['total']} elements compared end to end in {elapsed:.2f} s")
    assert elapsed < COMPARE_BUDGET_SECONDS * CI_MARGIN


def test_differences_after_the_display_cutoff_are_still_found(tmp_path):
    def build(edit: bool) -> Dataset:
        ds = baseline()
        comment = "".join(f"{i:04d} " for i in range(200))  # 1,000 characters
        ds.ImageComments = comment[:700] + ("#" if edit else comment[700]) + comment[701:]
        text = "SYNTHETIC PROTOCOL NOTE " * 210  # 5,040 characters, UT
        # Edit the second-to-last character: trailing spaces are not significant in DICOM.
        ds.RequestAttributesSequence[0].ScheduledProtocolCodeSequence[0].ProtocolContextSequence[0].TextValue = (
            text[:-2] + ("!" if edit else text[-2]) + text[-1]
        )
        values = ["A" * 300, "B" * 290 + ("Z" if edit else "B") * 10]
        ds.add_new(0x00100218, "UC", values)  # StrainAdditionalInformation, multi-valued UC
        return ds

    a = write(build(False), tmp_path / "long_a.dcm")
    b = write(build(True), tmp_path / "long_b.dcm")
    rows = {row.path: row for row in run_compare(str(a), str(b), only_diffs=True).rows}

    assert set(rows) == {"(0020,4000)", "(0040,0275)[0].(0040,0008)[0].(0040,0440)[0].(0040,A160)", "(0010,0218)"}
    for row in rows.values():
        assert row.status == "different"
        assert row.value_a == row.value_b, "display values are cut before the difference"
    # 1,000 characters minus the insignificant trailing space, 256 of them shown.
    assert rows["(0020,4000)"].value_a.endswith("…(+743 chars)")
    assert rows["(0010,0218)"].value_a[1].endswith("…(+44 chars)")


@pytest.fixture
def nm_file(tmp_path) -> Path:
    return write(baseline(), tmp_path / "nm.dcm")


@pytest.mark.parametrize("force", [False, True], ids=["plain", "force"])
def test_empty_file(nm_file, tmp_path, force):
    empty = tmp_path / "empty.dcm"
    empty.write_bytes(b"")
    result = engine("compare", *(["--force"] if force else []), str(nm_file), str(empty))
    assert result.returncode == 2
    assert json.loads(result.stderr)["error"]["code"] == "not_dicom"
    assert result.stdout == ""


@pytest.mark.parametrize("force", [False, True], ids=["plain", "force"])
def test_text_file_renamed_to_dcm(nm_file, tmp_path, force):
    text = tmp_path / "notes.dcm"
    text.write_text("Synthetic notes, not an image.\nLine two.\n", encoding="utf-8")
    result = engine("compare", *(["--force"] if force else []), str(nm_file), str(text))
    assert result.returncode == 2
    assert json.loads(result.stderr)["error"] == {
        "code": "not_dicom",
        "message": (
            "File could not be interpreted as DICOM, even with --force."
            if force
            else "File is missing the DICOM preamble and 'DICM' prefix. If it is a raw DICOM dataset, re-run with --force."
        ),
        "file": str(text),
    }


def test_truncated_file_is_rejected(nm_file, tmp_path):
    cut = tmp_path / "cut.dcm"
    cut.write_bytes(nm_file.read_bytes()[:-3])
    result = engine("compare", str(nm_file), str(cut))
    assert result.returncode == 2
    error = json.loads(result.stderr)["error"]
    assert error["code"] == "invalid_dicom"
    assert error["message"].startswith("File is truncated:")


def test_missing_dicm_prefix_with_and_without_force(nm_file, tmp_path):
    bare = tmp_path / "bare.dcm"
    bare.write_bytes(nm_file.read_bytes()[132:])  # drop preamble and "DICM"; keep the meta and dataset bytes

    plain = engine("compare", str(nm_file), str(bare))
    assert plain.returncode == 2
    assert json.loads(plain.stderr)["error"]["code"] == "not_dicom"

    forced = engine("compare", "--force", "--only-diffs", str(nm_file), str(bare))
    assert forced.returncode == 0, forced.stderr
    # With --force the leading group 0002 is still read as file meta, so the
    # content is identical to the original.
    report = json.loads(forced.stdout)
    assert report["rows"] == []
    assert report["files"]["b"]["transfer_syntax"]["uid"] == "1.2.840.10008.1.2.1"


@pytest.mark.parametrize("folder", ["Testé", "Prüfung 検査"])
def test_unicode_in_file_paths(tmp_path, folder):
    directory = tmp_path / folder
    directory.mkdir()
    a = write(baseline(), directory / "A été.dcm")
    b = write(baseline(), directory / "B.dcm")
    result = engine("compare", str(a), str(b))
    assert result.returncode == 0, result.stderr
    assert result.stdout.isascii()
    report = json.loads(result.stdout)
    assert unicodedata.normalize("NFC", report["files"]["a"]["path"]) == unicodedata.normalize("NFC", str(a))
    assert report["summary"]["total"] == report["summary"]["identical"]


def test_same_file_as_a_and_b(nm_file):
    result = engine("compare", "--only-diffs", str(nm_file), str(nm_file))
    assert result.returncode == 0
    report = json.loads(result.stdout)
    assert report["rows"] == []
    assert report["summary"]["total"] == report["summary"]["identical"] > 80
    assert report["files"]["a"] == report["files"]["b"]
