"""Read and validate DICOM files.

Files are only ever opened for reading, and pixel data is never loaded
(``stop_before_pixels=True``).
"""

from __future__ import annotations

import hashlib
import os
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from pydicom import dcmread
from pydicom.datadict import dictionary_has_tag
from pydicom.dataelem import RawDataElement
from pydicom.dataset import Dataset, FileDataset
from pydicom.errors import InvalidDicomError
from pydicom.uid import DeflatedExplicitVRLittleEndian

_HASH_CHUNK_BYTES = 1024 * 1024
_UNDEFINED_LENGTH = 0xFFFFFFFF
# The longest element header (explicit VR with a 4-byte length) is 12 bytes.
_MAX_HEADER_BYTES = 12
# Item / sequence delimitation items that may follow the last parsed element.
_DELIMITERS = {
    bytes.fromhex("feff0de000000000"),
    bytes.fromhex("feffdde000000000"),
    bytes.fromhex("fffee00d00000000"),
    bytes.fromhex("fffee0dd00000000"),
}
_PIXEL_TAGS = {
    bytes.fromhex("e07f1000"), bytes.fromhex("e07f0800"), bytes.fromhex("e07f0900"),
    bytes.fromhex("7fe00010"), bytes.fromhex("7fe00008"), bytes.fromhex("7fe00009"),
}


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

    # pydicom stops silently at end of file, so a cut-off file would otherwise
    # compare as if it were complete.
    truncation = _truncation(file_path, dataset, size_bytes)
    if truncation:
        raise LoadError("invalid_dicom", f"File is truncated: {truncation}", path)

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
    """A forced read of arbitrary bytes yields junk tags; real DICOM has dictionary tags.

    Group 0000 (command) tags are in the dictionary but never appear in files;
    zero-filled bytes parse as (0000,0000), so they do not count.
    """
    tags = list(dataset.keys()) + list(dataset.file_meta.keys())
    return any(tag >> 16 != 0x0000 and dictionary_has_tag(tag) for tag in tags)


def _truncation(path: Path, dataset: FileDataset, size: int) -> str | None:
    """Describe how the file is cut short, or return None if it is complete."""
    meta = dataset.file_meta
    if len(dataset) == 0:
        return "it contains no data elements after the file meta information."
    if 0x00020000 in meta:
        group_length = meta[0x00020000]
        if not isinstance(group_length.value, int):
            return "the file meta information group length is incomplete."
        meta_end = (group_length.file_tell or 0) + 4 + group_length.value
        if meta_end > size:
            return f"the file meta information needs {meta_end} bytes but the file has {size}."

    deflated = meta.get("TransferSyntaxUID") == DeflatedExplicitVRLittleEndian
    implicit, little = dataset.original_encoding
    parts = [(meta, False, True)] if deflated else [(meta, False, True), (dataset, implicit, little)]
    end = 0
    with path.open("rb") as handle:
        for part, part_implicit, part_little in parts:
            for tag in part.keys():
                element_end = _element_end(handle, part.get_item(tag), part_implicit, part_little)
                if element_end is None:
                    continue
                if element_end > size:
                    name = f"({tag >> 16:04X},{tag & 0xFFFF:04X})"
                    return f"element {name} needs {element_end} bytes but the file has {size}."
                end = max(end, element_end)
        if end == 0 or deflated:
            return None
        handle.seek(end)
        tail = handle.read(_MAX_HEADER_BYTES * 8)
    offset = 0
    while tail[offset:offset + 8] in _DELIMITERS:
        offset += 8
    remaining = size - end - offset
    if 0 < remaining < _MAX_HEADER_BYTES and tail[offset:offset + 4] not in _PIXEL_TAGS:
        return f"it ends {remaining} byte(s) into an element header at byte {end + offset}."
    return None


def _element_end(handle: BinaryIO, element: object, implicit: bool | None, little: bool | None) -> int | None:
    """File offset just past `element`, or None if it cannot be determined."""
    if isinstance(element, RawDataElement):
        if element.value_tell is None:
            return None
        if element.length == _UNDEFINED_LENGTH:
            # The raw value runs up to, and the element ends after, its delimiter.
            return element.value_tell + len(element.value or b"") + 8
        return element.value_tell + element.length
    # Elements pydicom already converted while reading (e.g. the character set)
    # keep only their value offset; read the length back from the header.
    value_tell = getattr(element, "file_tell", None)
    if value_tell is None or implicit is None or little is None:
        return None
    order = "<" if little else ">"
    if implicit:
        handle.seek(value_tell - 4)
        header = handle.read(4)
        return value_tell + struct.unpack(order + "L", header)[0] if len(header) == 4 else None
    handle.seek(value_tell - 8)
    header = handle.read(8)
    if len(header) != 8:
        return None
    if header[4:6].isalpha() and header[4:6].isupper():
        # Short form: tag, VR, 2-byte length.
        return value_tell + struct.unpack(order + "H", header[6:8])[0]
    if header[2:4] == b"\0\0" and header[0:2].isalpha():
        # Long form: tag, VR, two reserved zero bytes, 4-byte length.
        return value_tell + struct.unpack(order + "L", header[4:8])[0]
    return None
