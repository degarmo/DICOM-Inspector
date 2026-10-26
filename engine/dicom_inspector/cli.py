"""Command-line interface: ``python -m dicom_inspector compare A B``.

stdout carries exactly one JSON document on success. On failure, stderr carries
``{"error": {"code", "message", "file"}}``.

Exit codes:
    0  compared (with or without differences)
    1  unexpected error (including invalid command-line usage)
    2  a file is missing, unreadable, or not valid DICOM
"""

from __future__ import annotations

import argparse
import sys
import warnings
from collections.abc import Sequence

from pydicom.uid import UID

from dicom_inspector.diff import compare, summarize
from dicom_inspector.flatten import FlatDataset, flatten
from dicom_inspector.loader import LoadedFile, LoadError, load
from dicom_inspector.schema import (
    IDENTICAL,
    FileInfo,
    FileLabel,
    Report,
    ReportWarning,
    UidInfo,
    dumps,
    error_document,
)

EXIT_OK = 0
EXIT_UNEXPECTED = 1
EXIT_INVALID_FILE = 2

_TRANSFER_SYNTAX_PATH = "(0002,0010)"
_MEDIA_STORAGE_SOP_CLASS_PATH = "(0002,0002)"
_SOP_CLASS_PATH = "(0008,0016)"


class UsageError(Exception):
    pass


class _ArgumentParser(argparse.ArgumentParser):
    """Raise instead of printing plain-text usage and exiting with code 2."""

    def error(self, message: str) -> None:  # type: ignore[override]
        raise UsageError(message)


def build_parser() -> argparse.ArgumentParser:
    parser = _ArgumentParser(
        prog="python -m dicom_inspector",
        description="Compare the headers of two DICOM files and print a JSON diff.",
    )
    commands = parser.add_subparsers(dest="command", required=True, parser_class=_ArgumentParser)
    compare_cmd = commands.add_parser("compare", help="Compare two DICOM files.")
    compare_cmd.add_argument("file_a", help="First DICOM file (A).")
    compare_cmd.add_argument("file_b", help="Second DICOM file (B).")
    compare_cmd.add_argument(
        "--only-diffs", action="store_true", help="Omit identical rows from the output."
    )
    compare_cmd.add_argument("--pretty", action="store_true", help="Indent the JSON output.")
    compare_cmd.add_argument(
        "--force",
        action="store_true",
        help="Read files that lack the DICOM preamble and 'DICM' prefix.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
    except UsageError as exc:
        _emit_error("usage_error", str(exc), None)
        return EXIT_UNEXPECTED

    try:
        report = run_compare(
            args.file_a, args.file_b, force=args.force, only_diffs=args.only_diffs
        )
    except LoadError as exc:
        _emit_error(exc.code, exc.message, exc.file)
        return EXIT_INVALID_FILE
    except Exception as exc:
        _emit_error("internal_error", f"{type(exc).__name__}: {exc}", None)
        return EXIT_UNEXPECTED

    sys.stdout.write(report.to_json(pretty=args.pretty) + "\n")
    sys.stdout.flush()
    return EXIT_OK


def run_compare(path_a: str, path_b: str, *, force: bool = False, only_diffs: bool = False) -> Report:
    loaded_a, flat_a, warnings_a = _inspect(path_a, "a", force)
    loaded_b, flat_b, warnings_b = _inspect(path_b, "b", force)

    rows = compare(flat_a, flat_b)
    summary = summarize(rows)
    if only_diffs:
        rows = [row for row in rows if row.status != IDENTICAL]

    return Report(
        files={"a": _file_info(loaded_a, flat_a), "b": _file_info(loaded_b, flat_b)},
        summary=summary,
        warnings=warnings_a + warnings_b,
        rows=rows,
    )


def _inspect(
    path: str, label: FileLabel, force: bool
) -> tuple[LoadedFile, FlatDataset, list[ReportWarning]]:
    """Load and flatten one file, turning reader warnings into report warnings."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        loaded = load(path, force=force)
        flat = flatten(loaded.dataset)

    collected = [
        ReportWarning(code=w.code, message=w.message, file=label, path=w.path)
        for w in flat.warnings
    ]
    seen: set[str] = set()
    for caught_warning in caught:
        message = str(caught_warning.message)
        if message not in seen:
            seen.add(message)
            collected.append(ReportWarning(code="reader_warning", message=message, file=label))
    return loaded, flat, collected


def _file_info(loaded: LoadedFile, flat: FlatDataset) -> FileInfo:
    sop_class = _uid_info(flat, _SOP_CLASS_PATH) or _uid_info(flat, _MEDIA_STORAGE_SOP_CLASS_PATH)
    return FileInfo(
        path=loaded.path,
        size_bytes=loaded.size_bytes,
        sha256=loaded.sha256,
        transfer_syntax=_uid_info(flat, _TRANSFER_SYNTAX_PATH),
        sop_class=sop_class,
    )


def _uid_info(flat: FlatDataset, path: str) -> UidInfo | None:
    element = flat.elements.get(path)
    if element is None or not isinstance(element.value, str) or not element.value:
        return None
    uid = UID(element.value)
    return UidInfo(uid=str(uid), name=uid.name)


def _emit_error(code: str, message: str, file: str | None) -> None:
    sys.stderr.write(dumps(error_document(code, message, file)) + "\n")
    sys.stderr.flush()
