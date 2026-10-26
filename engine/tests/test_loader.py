from __future__ import annotations

import hashlib

import pytest

from dicom_inspector.loader import LoadError, load


def test_load_reports_size_and_hash(fixtures):
    a, _ = fixtures["08_identical"]
    loaded = load(str(a))
    data = a.read_bytes()
    assert loaded.size_bytes == len(data)
    assert loaded.sha256 == hashlib.sha256(data).hexdigest()
    assert loaded.path == str(a.resolve())
    assert "PixelData" not in loaded.dataset


def test_load_rejects_non_dicom(fixtures):
    _, b = fixtures["09_not_dicom"]
    with pytest.raises(LoadError) as info:
        load(str(b))
    assert info.value.code == "not_dicom"


def test_force_still_rejects_non_dicom(fixtures):
    _, b = fixtures["09_not_dicom"]
    with pytest.raises(LoadError) as info:
        load(str(b), force=True)
    assert info.value.code == "not_dicom"


def test_force_accepts_bare_dataset(fixtures):
    _, b = fixtures["10_no_preamble"]
    loaded = load(str(b), force=True)
    assert loaded.dataset.PatientName == "TEST^SYNTHETIC"


def test_missing_file(tmp_path):
    with pytest.raises(LoadError) as info:
        load(str(tmp_path / "nope.dcm"))
    assert info.value.code == "file_not_found"
