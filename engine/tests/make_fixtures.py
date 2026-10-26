"""Build synthetic DICOM fixture pairs from scratch.

No real patient data: every value is obviously fake, and every UID is a fixed
``2.25.*`` UID so the output is byte-for-byte reproducible.

Usage:
    python tests/make_fixtures.py [output_dir]
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from copy import deepcopy
from pathlib import Path

from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import (
    UID,
    ExplicitVRBigEndian,
    ExplicitVRLittleEndian,
    ImplicitVRLittleEndian,
    SecondaryCaptureImageStorage,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"

Pair = tuple[Path, Path]

SOP_INSTANCE_UID = "2.25.1001"
SYNTHETIC_NAME = "TEST^SYNTHETIC"
NON_ASCII_NAME = "TËST^SYNTHÉTIC"  # "TËST^SYNTHÉTIC"
PRIVATE_CREATOR = "SYNTHETIC_VENDOR_1"
LONG_COMMENT_LENGTH = 300


def baseline() -> Dataset:
    ds = Dataset()
    ds.SpecificCharacterSet = "ISO_IR 100"
    ds.ImageType = ["ORIGINAL", "PRIMARY", "AXIAL"]
    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = SOP_INSTANCE_UID
    ds.StudyDate = "20000101"
    ds.StudyTime = "120000"
    ds.AccessionNumber = "SYNACC0001"
    ds.Modality = "OT"
    ds.StudyDescription = "SYNTHETIC STUDY"

    instance = Dataset()
    instance.ReferencedSOPClassUID = SecondaryCaptureImageStorage
    instance.ReferencedSOPInstanceUID = "2.25.3001"
    series = Dataset()
    series.SeriesInstanceUID = "2.25.2999"
    series.ReferencedInstanceSequence = Sequence([instance])
    ds.ReferencedSeriesSequence = Sequence([series])

    ds.PatientName = SYNTHETIC_NAME
    ds.PatientID = "SYNTH-0001"
    ds.IssuerOfPatientID = "SYNTHETIC-ISSUER"
    ds.PatientBirthDate = "19000101"
    ds.StudyInstanceUID = "2.25.1000"
    ds.SeriesInstanceUID = "2.25.2000"
    ds.SeriesNumber = "1"
    ds.InstanceNumber = "1"
    ds.Rows = 64
    ds.Columns = 64
    ds.PixelSpacing = ["0.5", "0.5"]
    return ds


def write(ds: Dataset, path: Path, transfer_syntax: UID = ExplicitVRLittleEndian) -> Path:
    meta = FileMetaDataset()
    meta.FileMetaInformationVersion = b"\x00\x01"
    meta.MediaStorageSOPClassUID = ds.SOPClassUID
    meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    meta.TransferSyntaxUID = transfer_syntax
    meta.ImplementationClassUID = "2.25.999"
    meta.ImplementationVersionName = "SYNTHETIC_TEST"
    ds = deepcopy(ds)
    ds.file_meta = meta
    ds.preamble = b"\x00" * 128
    ds.save_as(
        path,
        implicit_vr=transfer_syntax.is_implicit_VR,
        little_endian=transfer_syntax.is_little_endian,
        enforce_file_format=True,
    )
    return path


def write_without_preamble(ds: Dataset, path: Path) -> Path:
    """A bare dataset: no preamble, no 'DICM' prefix, no file meta."""
    ds.save_as(path, implicit_vr=True, little_endian=True, enforce_file_format=False)
    return path


def with_non_ascii_name(charset: str) -> Dataset:
    ds = baseline()
    ds.SpecificCharacterSet = charset
    ds.PatientName = NON_ASCII_NAME
    return ds


def long_comment(change_at: int | None = None) -> str:
    text = ("SYNTHETIC COMMENT " * 20)[:LONG_COMMENT_LENGTH]
    if change_at is None:
        return text
    return text[:change_at] + "#" + text[change_at + 1 :]


def _case_study_uid(a: Path, b: Path) -> None:
    write(baseline(), a)
    ds = baseline()
    ds.StudyInstanceUID = "2.25.1999"
    write(ds, b)


def _case_blank_accession(a: Path, b: Path) -> None:
    write(baseline(), a)
    ds = baseline()
    ds.AccessionNumber = ""
    write(ds, b)


def _case_issuer(a: Path, b: Path) -> None:
    write(baseline(), a)
    ds = baseline()
    ds.IssuerOfPatientID = "OTHER-SYNTHETIC-ISSUER"
    write(ds, b)


def _case_charset(a: Path, b: Path) -> None:
    # Same name, encoded as Latin-1 in A and UTF-8 in B.
    write(with_non_ascii_name("ISO_IR 100"), a)
    write(with_non_ascii_name("ISO_IR 192"), b)


def _case_private_block(a: Path, b: Path) -> None:
    write(baseline(), a)
    ds = baseline()
    block = ds.private_block(0x0009, PRIVATE_CREATOR, create=True)
    block.add_new(0x01, "LO", "SYNTHETIC PRIVATE VALUE")
    block.add_new(0x02, "US", 42)
    block.add_new(0x03, "OB", bytes(range(16)))
    write(ds, b)


def _case_nested_sequence(a: Path, b: Path) -> None:
    write(baseline(), a)
    ds = baseline()
    ds.ReferencedSeriesSequence[0].ReferencedInstanceSequence[0].ReferencedSOPInstanceUID = (
        "2.25.3002"
    )
    write(ds, b)


def _case_transfer_syntax(a: Path, b: Path) -> None:
    # Both UIDs are 19 characters, so the file meta group length is unchanged.
    write(baseline(), a, ExplicitVRLittleEndian)
    write(baseline(), b, ExplicitVRBigEndian)


def _case_identical(a: Path, b: Path) -> None:
    write(baseline(), a)
    write(baseline(), b)


def _case_not_dicom(a: Path, b: Path) -> None:
    write(baseline(), a)
    b.write_text("This is a plain text file, not DICOM.\n", encoding="ascii")


def _case_no_preamble(a: Path, b: Path) -> None:
    write(baseline(), a)
    write_without_preamble(baseline(), b)


def _case_vr_mismatch(a: Path, b: Path) -> None:
    write(baseline(), a)
    ds = baseline()
    ds.add_new(0x00081030, "SH", ds.StudyDescription)  # StudyDescription is LO
    write(ds, b)


def _case_long_value(a: Path, b: Path) -> None:
    ds = baseline()
    ds.ImageComments = long_comment()
    write(ds, a)
    ds.ImageComments = long_comment(change_at=280)
    write(ds, b)


def _case_decode_error(a: Path, b: Path) -> None:
    # B is A's bytes with the charset relabelled as UTF-8 (same length), so the
    # Latin-1 encoded name in B is not valid for its declared character set.
    write(with_non_ascii_name("ISO_IR 100"), a)
    data = a.read_bytes()
    assert data.count(b"ISO_IR 100") == 1
    b.write_bytes(data.replace(b"ISO_IR 100", b"ISO_IR 192"))


def _case_implicit_vr(a: Path, b: Path) -> None:
    write(baseline(), a, ExplicitVRLittleEndian)
    write(baseline(), b, ImplicitVRLittleEndian)


# name -> (builder, suffix of file B)
CASES: dict[str, tuple[Callable[[Path, Path], None], str]] = {
    "01_study_uid": (_case_study_uid, ".dcm"),
    "02_blank_accession": (_case_blank_accession, ".dcm"),
    "03_issuer": (_case_issuer, ".dcm"),
    "04_charset": (_case_charset, ".dcm"),
    "05_private_block": (_case_private_block, ".dcm"),
    "06_nested_sequence": (_case_nested_sequence, ".dcm"),
    "07_transfer_syntax": (_case_transfer_syntax, ".dcm"),
    "08_identical": (_case_identical, ".dcm"),
    "09_not_dicom": (_case_not_dicom, ".txt"),
    "10_no_preamble": (_case_no_preamble, ".dcm"),
    "11_vr_mismatch": (_case_vr_mismatch, ".dcm"),
    "12_long_value": (_case_long_value, ".dcm"),
    "13_decode_error": (_case_decode_error, ".dcm"),
    "14_implicit_vr": (_case_implicit_vr, ".dcm"),
}


def build_all(directory: Path = FIXTURE_DIR) -> dict[str, Pair]:
    directory.mkdir(parents=True, exist_ok=True)
    pairs: dict[str, Pair] = {}
    for name, (builder, suffix_b) in CASES.items():
        a = directory / f"{name}_a.dcm"
        b = directory / f"{name}_b{suffix_b}"
        builder(a, b)
        pairs[name] = (a, b)
    return pairs


if __name__ == "__main__":
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else FIXTURE_DIR
    for case, (file_a, file_b) in build_all(out_dir).items():
        print(f"{case}: {file_a.name} {file_b.name}")
