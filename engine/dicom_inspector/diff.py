"""Compare two flattened datasets row by row."""

from __future__ import annotations

from dicom_inspector.flatten import FlatDataset, FlatElement
from dicom_inspector.schema import (
    DIFFERENT,
    IDENTICAL,
    ONLY_IN_A,
    ONLY_IN_B,
    Row,
    Summary,
)


def compare(a: FlatDataset, b: FlatDataset) -> list[Row]:
    """One row per path present in either dataset, sorted by tag path."""
    paths = set(a.elements) | set(b.elements)
    ordered = sorted(paths, key=lambda p: (a.elements.get(p) or b.elements[p]).sort_key)
    return [_row(a.elements.get(p), b.elements.get(p)) for p in ordered]


def summarize(rows: list[Row]) -> Summary:
    counts = {IDENTICAL: 0, DIFFERENT: 0, ONLY_IN_A: 0, ONLY_IN_B: 0}
    priority_mismatches = 0
    for row in rows:
        counts[row.status] += 1
        if row.is_priority and row.status != IDENTICAL:
            priority_mismatches += 1
    return Summary(
        total=len(rows),
        identical=counts[IDENTICAL],
        different=counts[DIFFERENT],
        only_in_a=counts[ONLY_IN_A],
        only_in_b=counts[ONLY_IN_B],
        priority_mismatches=priority_mismatches,
    )


def _row(ea: FlatElement | None, eb: FlatElement | None) -> Row:
    base = ea or eb
    assert base is not None

    if ea is None:
        status = ONLY_IN_B
    elif eb is None:
        status = ONLY_IN_A
    elif ea.vr != eb.vr or ea.compare_key != eb.compare_key:
        status = DIFFERENT
    else:
        status = IDENTICAL

    vr_a = ea.vr if ea else None
    vr_b = eb.vr if eb else None
    return Row(
        path=base.path,
        keyword_path=base.keyword_path,
        tag=base.tag,
        keyword=base.keyword,
        vr=base.vr,
        value_a=ea.value if ea else None,
        value_b=eb.value if eb else None,
        status=status,
        is_private=base.is_private,
        private_creator=base.private_creator,
        is_priority=base.is_priority,
        vr_a=vr_a,
        vr_b=vr_b,
        vr_mismatch=vr_a is not None and vr_b is not None and vr_a != vr_b,
    )
