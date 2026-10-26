"""Value rendering and path construction."""

from __future__ import annotations

from pydicom import dcmread
from pydicom.sequence import Sequence
from pydicom.tag import Tag

from dicom_inspector.flatten import (
    MAX_DISPLAY_CHARS,
    bytes_summary,
    flatten,
    format_tag,
    truncate,
)
from make_fixtures import NON_ASCII_NAME, baseline, write


def test_truncate_boundary():
    exact = "x" * MAX_DISPLAY_CHARS
    assert truncate(exact) == exact
    assert truncate(exact + "yz") == exact + "…(+2 chars)"


def test_bytes_summary_format():
    assert bytes_summary(b"") == "<0 bytes, sha256:e3b0c44298fc>"
    assert bytes_summary(b"\x00\x01") == "<2 bytes, sha256:b413f47d13ee>"


def test_format_tag_is_uppercase_hex():
    assert format_tag(Tag(0x0020, 0x000E)) == "(0020,000E)"


def test_flatten_baseline(fixtures):
    a, _ = fixtures["08_identical"]
    flat = flatten(dcmread(a, stop_before_pixels=True))
    elements = flat.elements
    assert flat.warnings == []

    assert elements["(0002,0001)"].value == "<2 bytes, sha256:b413f47d13ee>"
    assert elements["(0002,0001)"].vr == "OB"
    assert elements["(0008,0008)"].value == ["ORIGINAL", "PRIMARY", "AXIAL"]
    assert elements["(0028,0030)"].value == ["0.5", "0.5"]
    assert elements["(0028,0010)"].value == "64"
    assert elements["(0010,0010)"].value == "TEST^SYNTHETIC"

    nested = elements["(0008,1115)[0].(0008,114A)[0].(0008,1150)"]
    assert nested.keyword_path == (
        "ReferencedSeriesSequence[0].ReferencedInstanceSequence[0].ReferencedSOPClassUID"
    )
    assert nested.keyword == "ReferencedSOPClassUID"


def test_nested_item_charset_override(tmp_path):
    ds = baseline()
    ds.SpecificCharacterSet = "ISO_IR 192"
    ds.PatientName = NON_ASCII_NAME
    item = baseline()
    item.SpecificCharacterSet = "ISO_IR 100"
    item.PatientName = NON_ASCII_NAME
    ds.OtherPatientIDsSequence = Sequence([item])
    path = write(ds, tmp_path / "nested_charset.dcm")

    data = path.read_bytes()
    assert NON_ASCII_NAME.encode("utf-8") in data
    assert NON_ASCII_NAME.encode("latin-1") in data

    flat = flatten(dcmread(path, stop_before_pixels=True))
    assert flat.warnings == []
    assert flat.elements["(0010,0010)"].value == NON_ASCII_NAME
    assert flat.elements["(0010,1002)[0].(0010,0010)"].value == NON_ASCII_NAME


def test_nested_item_inherits_charset(tmp_path):
    ds = baseline()
    ds.SpecificCharacterSet = "ISO_IR 192"
    item = baseline()
    del item.SpecificCharacterSet
    item.PatientName = NON_ASCII_NAME
    ds.OtherPatientIDsSequence = Sequence([item])
    path = write(ds, tmp_path / "inherited_charset.dcm")
    assert NON_ASCII_NAME.encode("utf-8") in path.read_bytes()

    flat = flatten(dcmread(path, stop_before_pixels=True))
    assert flat.warnings == []
    assert flat.elements["(0010,1002)[0].(0010,0010)"].value == NON_ASCII_NAME
