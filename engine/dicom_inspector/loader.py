"""Read and validate DICOM files.

Files are only ever opened for reading, and pixel data is never loaded
(``stop_before_pixels=True``).
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from pydicom import dcmread
from pydicom.datadict import dictionary_has_tag
from pydicom.dataset import FileDataset
from pydicom.errors import InvalidDicomError

_HASH_CHUNK_BYTES = 1024 * 1024


class LoadError(Exception):
    """A file could not be read as DICOM. Maps to CLI exit code 2."""

    def __init__(self, code: str, message: str, file: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.file = file


@dataclass(frozen=True)
class LoadedFile:
    path: str
    size_bytes: int
    sha256: str
    dataset: FileDataset


def load(path: str, *, force: bool = False) -> LoadedFile:
    """Read ``path`` as DICOM, raising :class:`LoadError` if that is not possible.

    Without ``force``, files lacking the 128-byte preamble and ``DICM`` prefix
    are rejected. With ``force``, they are parsed anyway, but the result must
    still contain at least one recognised DICOM element.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise LoadError("file_not_found", f"File not found: {path}", path)
    if not file_path.is_file():
        raise LoadError("not_a_file", f"Not a regular file: {path}", path)

    try:
        size_bytes, sha256 = _hash_file(file_path)
    except OSError as exc:
        raise LoadError("unreadable", f"Cannot read file: {exc.strerror or exc}", path) from exc

    try:
        dataset = dcmread(file_path, stop_before_pixels=True, force=force)
    except InvalidDicomError as exc:
        raise LoadError(
            "not_dicom",
            "File is missing the DICOM preamble and 'DICM' prefix. "
            "If it is a raw DICOM dataset, re-run with --force.",
            path,
        ) from exc
    except OSError as exc:
        raise LoadError("unreadable", f"Cannot read file: {exc.strerror or exc}", path) from exc
    except Exception as exc:
        raise LoadError("invalid_dicom", f"Failed to parse DICOM data: {exc}", path) from exc

    if force and not _has_known_element(dataset):
        raise LoadError(
            "not_dicom",
            "File could not be interpreted as DICOM, even with --force.",
            path,
        )

    return LoadedFile(
        path=os.path.abspath(path),
        size_bytes=size_bytes,
        sha256=sha256,
        dataset=dataset,
    )


def _hash_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(_HASH_CHUNK_BYTES):
            digest.update(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


def _has_known_element(dataset: FileDataset) -> bool:
    """A forced read of arbitrary bytes yields junk tags; real DICOM has dictionary tags."""
    tags = list(dataset.keys()) + list(dataset.file_meta.keys())
    return any(dictionary_has_tag(tag) for tag in tags)
