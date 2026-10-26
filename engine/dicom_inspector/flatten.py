"""Flatten a DICOM dataset into ``{path: FlatElement}``.

Sequences are walked recursively. Every element gets a stable tag path such as
``(0008,1115)[0].(0020,000E)`` and a readable keyword path such as
``ReferencedSeriesSequence[0].SeriesInstanceUID``.

Each element carries two forms of its value:

* ``value``: the JSON-safe display form (truncated, bytes summarised).
* ``compare_key``: the full value, used for comparison.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from pydicom import config
from pydicom.charset import convert_encodings, decode_bytes, default_encoding
from pydicom.datadict import dictionary_has_tag, dictionary_VR, keyword_for_tag
from pydicom.dataelem import DataElement, RawDataElement
from pydicom.dataset import Dataset
from pydicom.multival import MultiValue
from pydicom.tag import BaseTag, Tag
from pydicom.valuerep import CUSTOMIZABLE_CHARSET_VR, PN_DELIMS, TEXT_VR_DELIMS

from dicom_inspector.priority import is_priority
from dicom_inspector.schema import ReportWarning, Value

MAX_DISPLAY_CHARS = 256

SPECIFIC_CHARACTER_SET = Tag(0x0008, 0x0005)

# VRs whose value is a single unsplit text block (no backslash multiplicity).
_UNSPLIT_TEXT_VRS = {"LT", "ST", "UT"}


@dataclass(frozen=True)
class FlatElement:
    sort_key: tuple[int, ...]
    path: str
    keyword_path: str
    tag: str
    keyword: str
    vr: str
    value: Value
    compare_key: tuple[Any, ...]
    is_private: bool
    private_creator: str | None
    is_priority: bool


@dataclass(frozen=True)
class FlatDataset:
    elements: dict[str, FlatElement]
    warnings: list[ReportWarning]


def flatten(dataset: Dataset) -> FlatDataset:
    """Flatten file meta (group 0002) and the main dataset into one mapping."""
    elements: dict[str, FlatElement] = {}
    warnings: list[ReportWarning] = []

    file_meta = getattr(dataset, "file_meta", None)
    if file_meta is not None:
        # File meta is always encoded in the default character repertoire.
        _walk(file_meta, (), "", "", None, elements, warnings)

    body: dict[str, FlatElement] = {}
    _walk(dataset, (), "", "", None, body, warnings)
    for path, element in body.items():
        if path in elements:
            warnings.append(
                ReportWarning(
                    code="duplicate_file_meta_element",
                    message=f"{element.tag} appears in both the file meta and the dataset; "
                    "the file meta value is compared.",
                    path=path,
                )
            )
            continue
        elements[path] = element

    return FlatDataset(elements=elements, warnings=warnings)


def _walk(
    dataset: Dataset,
    key_prefix: tuple[int, ...],
    path_prefix: str,
    keyword_prefix: str,
    inherited_charset: Any,
    out: dict[str, FlatElement],
    warnings: list[ReportWarning],
) -> None:
    charset = inherited_charset
    if SPECIFIC_CHARACTER_SET in dataset:
        charset = dataset[SPECIFIC_CHARACTER_SET].value
    encodings = _encodings(charset, path_prefix, warnings)

    # Private creator values in this dataset, keyed by creator tag.
    creators: dict[int, str] = {}

    for tag in sorted(dataset.keys()):
        tag = Tag(tag)
        tag_str = format_tag(tag)
        path = f"{path_prefix}.{tag_str}" if path_prefix else tag_str
        keyword = keyword_for_tag(tag) if not tag.is_private else ""
        keyword_segment = keyword or tag_str
        keyword_path = f"{keyword_prefix}.{keyword_segment}" if keyword_prefix else keyword_segment
        sort_key = key_prefix + (int(tag),)

        vr, value, compare_key, items = _read_element(dataset, tag, encodings, path, warnings)

        private_creator = None
        if tag.is_private:
            if 0x0010 <= tag.element <= 0x00FF:
                creators[int(tag)] = value if isinstance(value, str) else "\\".join(value)
                private_creator = creators[int(tag)]
            elif tag.element >= 0x1000:
                private_creator = creators.get(int(Tag(tag.group, tag.element >> 8)))

        out[path] = FlatElement(
            sort_key=sort_key,
            path=path,
            keyword_path=keyword_path,
            tag=tag_str,
            keyword=keyword,
            vr=vr,
            value=value,
            compare_key=compare_key,
            is_private=tag.is_private,
            private_creator=private_creator,
            is_priority=is_priority(tag),
        )

        for index, item in enumerate(items):
            _walk(
                item,
                sort_key + (index,),
                f"{path}[{index}]",
                f"{keyword_path}[{index}]",
                charset,
                out,
                warnings,
            )


def _read_element(
    dataset: Dataset,
    tag: BaseTag,
    encodings: list[str],
    path: str,
    warnings: list[ReportWarning],
) -> tuple[str, Value, tuple[Any, ...], list[Dataset]]:
    """Return ``(vr, display_value, compare_key, sequence_items)`` for one element."""
    raw = dataset.get_item(tag)

    # Check text decoding ourselves, strictly: pydicom would otherwise silently
    # substitute replacement characters and two different byte strings could
    # then compare equal.
    if isinstance(raw, RawDataElement) and isinstance(raw.value, bytes):
        raw_vr = raw.VR or (dictionary_VR(tag) if dictionary_has_tag(tag) else "UN")
        if raw_vr in CUSTOMIZABLE_CHARSET_VR:
            error = _decode_error(raw.value, raw_vr, encodings)
            if error is not None:
                warnings.append(
                    ReportWarning(
                        code="decode_error",
                        message=f"Could not decode {format_tag(tag)} using "
                        f"{'/'.join(encodings)}: {error}. Showing a bytes summary instead.",
                        path=path,
                    )
                )
                return raw_vr, bytes_summary(raw.value), ("bytes", raw.value), []

    try:
        element = dataset[tag]
    except Exception as exc:
        if isinstance(raw, RawDataElement) and isinstance(raw.value, bytes):
            warnings.append(
                ReportWarning(
                    code="value_error",
                    message=f"Could not interpret {format_tag(tag)}: {exc}. "
                    "Showing a bytes summary instead.",
                    path=path,
                )
            )
            raw_vr = raw.VR or "UN"
            return raw_vr, bytes_summary(raw.value), ("bytes", raw.value), []
        raise

    vr = str(element.VR)
    if vr == "SQ":
        items = list(element.value or [])
        count = len(items)
        return vr, f"<{count} item{'' if count == 1 else 's'}>", ("sequence", count), items

    value, compare_key = _render(element)
    return vr, value, compare_key, []


def _render(element: DataElement) -> tuple[Value, tuple[Any, ...]]:
    value = element.value
    if value is None:
        return "", ("text", "")
    if isinstance(value, (bytes, bytearray)):
        return bytes_summary(bytes(value)), ("bytes", bytes(value))
    if isinstance(value, (MultiValue, list, tuple)):
        full = [_to_text(v) for v in value]
        return [truncate(s) for s in full], ("multi", tuple(full))
    full = _to_text(value)
    return truncate(full), ("text", full)


def _to_text(value: Any) -> str:
    if isinstance(value, (bytes, bytearray)):
        return bytes_summary(bytes(value))
    return str(value)


def _encodings(charset: Any, path: str, warnings: list[ReportWarning]) -> list[str]:
    """Python codecs for a Specific Character Set value, warning on unknown terms."""
    try:
        with _strict_decoding():
            return convert_encodings(charset)
    except (LookupError, ValueError) as exc:
        warnings.append(
            ReportWarning(
                code="unknown_character_set",
                message=f"Unsupported Specific Character Set {charset!r}: {exc}. "
                f"Falling back to {default_encoding}.",
                path=path or None,
            )
        )
        return [default_encoding]


def _decode_error(raw: bytes, vr: str, encodings: list[str]) -> str | None:
    """Return why ``raw`` cannot be decoded, or ``None`` if it decodes cleanly."""
    values = [raw] if vr in _UNSPLIT_TEXT_VRS else raw.split(b"\\")
    try:
        with _strict_decoding():
            for value in values:
                if vr == "PN":
                    for component in value.split(b"="):
                        decode_bytes(component, encodings, PN_DELIMS)
                else:
                    decode_bytes(value, encodings, TEXT_VR_DELIMS)
    except (UnicodeError, LookupError) as exc:
        return str(exc)
    return None


@contextmanager
def _strict_decoding() -> Iterator[None]:
    """Make pydicom raise on decode problems instead of substituting characters."""
    previous = config.settings.reading_validation_mode
    config.settings.reading_validation_mode = config.RAISE
    try:
        yield
    finally:
        config.settings.reading_validation_mode = previous


def format_tag(tag: BaseTag) -> str:
    return f"({tag.group:04X},{tag.element:04X})"


def bytes_summary(data: bytes) -> str:
    return f"<{len(data)} bytes, sha256:{hashlib.sha256(data).hexdigest()[:12]}>"


def truncate(text: str) -> str:
    if len(text) <= MAX_DISPLAY_CHARS:
        return text
    return f"{text[:MAX_DISPLAY_CHARS]}…(+{len(text) - MAX_DISPLAY_CHARS} chars)"
