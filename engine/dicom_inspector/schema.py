"""Output contract for the comparison engine (JSON over stdout).

Field order in these dataclasses is the key order in the emitted JSON.
Bump ``SCHEMA_VERSION`` on any change a consumer could notice.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Literal, Union

SCHEMA_VERSION = "1.0"

IDENTICAL = "identical"
DIFFERENT = "different"
ONLY_IN_A = "only_in_a"
ONLY_IN_B = "only_in_b"

Status = Literal["identical", "different", "only_in_a", "only_in_b"]
Value = Union[str, list[str]]
FileLabel = Literal["a", "b"]


@dataclass(frozen=True)
class UidInfo:
    uid: str
    name: str


@dataclass(frozen=True)
class FileInfo:
    path: str
    size_bytes: int
    sha256: str
    transfer_syntax: UidInfo | None
    sop_class: UidInfo | None


@dataclass(frozen=True)
class Summary:
    total: int
    identical: int
    different: int
    only_in_a: int
    only_in_b: int
    priority_mismatches: int


@dataclass(frozen=True)
class ReportWarning:
    code: str
    message: str
    file: FileLabel | None = None
    path: str | None = None


@dataclass(frozen=True)
class Row:
    path: str
    keyword_path: str
    tag: str
    keyword: str
    vr: str
    value_a: Value | None
    value_b: Value | None
    status: Status
    is_private: bool
    private_creator: str | None
    is_priority: bool
    vr_a: str | None
    vr_b: str | None
    vr_mismatch: bool


@dataclass(frozen=True)
class Report:
    files: dict[FileLabel, FileInfo]
    summary: Summary
    warnings: list[ReportWarning]
    rows: list[Row]
    schema_version: str = field(default=SCHEMA_VERSION)

    def to_dict(self) -> dict:
        data = asdict(self)
        # schema_version leads the document so consumers can check it first.
        return {"schema_version": data.pop("schema_version"), **data}

    def to_json(self, *, pretty: bool = False) -> str:
        return dumps(self.to_dict(), pretty=pretty)


def error_document(code: str, message: str, file: str | None) -> dict:
    return {"error": {"code": code, "message": message, "file": file}}


def dumps(data: dict, *, pretty: bool = False) -> str:
    """Serialise deterministically. ASCII-only output is safe on any stdout encoding."""
    if pretty:
        return json.dumps(data, indent=2, ensure_ascii=True)
    return json.dumps(data, separators=(",", ":"), ensure_ascii=True)
