"""Integration-critical tags. Rows for these get ``is_priority: true``."""

from __future__ import annotations

from pydicom.datadict import tag_for_keyword
from pydicom.tag import BaseTag

PRIORITY_KEYWORDS: tuple[str, ...] = (
    "PatientID",
    "IssuerOfPatientID",
    "AccessionNumber",
    "StudyInstanceUID",
    "SeriesInstanceUID",
    "SOPInstanceUID",
    "SOPClassUID",
    "Modality",
    "StudyDate",
    "StudyTime",
    "SpecificCharacterSet",
    "TransferSyntaxUID",
)


def _resolve(keyword: str) -> int:
    tag = tag_for_keyword(keyword)
    if tag is None:
        raise ValueError(f"Unknown DICOM keyword in priority list: {keyword}")
    return tag


PRIORITY_TAGS: frozenset[int] = frozenset(_resolve(k) for k in PRIORITY_KEYWORDS)


def is_priority(tag: BaseTag) -> bool:
    """Priority if the tag is on the list, or is any private tag."""
    return tag in PRIORITY_TAGS or tag.is_private
