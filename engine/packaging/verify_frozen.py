"""Check that the frozen engine behaves exactly like `python -m dicom_inspector`.

For every fixture pair built by tests/make_fixtures.py, both engines are run with
the same arguments. Exit code, stderr and stdout must be byte-identical. The only
permitted difference is the value of files.a.path / files.b.path in the JSON.

Run with an interpreter that has the engine's dependencies (the build venv):

    python engine/packaging/verify_frozen.py [--exe PATH]

Exits 0 when every run matches, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent
EXE_NAME = "dicom_inspector_engine.exe" if os.name == "nt" else "dicom_inspector_engine"
DEFAULT_EXE = ENGINE_DIR / "dist" / "dicom_inspector_engine" / EXE_NAME

sys.path.insert(0, str(ENGINE_DIR / "tests"))
import make_fixtures  # noqa: E402

# Flag sets run for every pair, plus extra ones for pairs where --force matters.
COMMON_FLAGS: list[list[str]] = [[], ["--only-diffs", "--pretty"]]
EXTRA_FLAGS: dict[str, list[list[str]]] = {
    "09_not_dicom": [["--force"]],
    "10_no_preamble": [["--force"], ["--force", "--only-diffs"]],
}
PATH_PLACEHOLDER = b'"<path>"'


def run(command: list[str], cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(command, cwd=cwd, env=env, capture_output=True, check=False, timeout=120)


def without_file_paths(stdout: bytes) -> bytes:
    """Replace the JSON-encoded files.*.path strings, which may legitimately differ."""
    try:
        files = json.loads(stdout)["files"]
    except (ValueError, KeyError, TypeError):
        return stdout
    for label in ("a", "b"):
        encoded = json.dumps(files[label]["path"], ensure_ascii=True).encode("ascii")
        stdout = stdout.replace(b'"path":' + encoded, b'"path":' + PATH_PLACEHOLDER)
        stdout = stdout.replace(b'"path": ' + encoded, b'"path": ' + PATH_PLACEHOLDER)
    return stdout


def first_difference(left: bytes, right: bytes) -> str:
    for index, (x, y) in enumerate(zip(left, right)):
        if x != y:
            return f"first difference at byte {index}: {left[index:index + 60]!r} vs {right[index:index + 60]!r}"
    return f"lengths differ: {len(left)} vs {len(right)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--exe", type=Path, default=DEFAULT_EXE, help="Frozen engine executable.")
    args = parser.parse_args(argv)

    exe: Path = args.exe.resolve()
    if not exe.is_file():
        print(f"Frozen engine not found: {exe}", file=sys.stderr)
        return 1

    # Neither run may depend on an ambient PYTHONPATH/PYTHONHOME.
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTHON")}

    failures = 0
    runs = 0
    with tempfile.TemporaryDirectory(prefix="dicom-inspector-verify-") as tmp:
        pairs = make_fixtures.build_all(Path(tmp))
        for case, (file_a, file_b) in pairs.items():
            for flags in COMMON_FLAGS + EXTRA_FLAGS.get(case, []):
                engine_args = ["compare", *flags, str(file_a), str(file_b)]
                python = run([sys.executable, "-m", "dicom_inspector", *engine_args], ENGINE_DIR, env)
                frozen = run([str(exe), *engine_args], exe.parent, env)
                runs += 1

                problems = []
                if python.returncode != frozen.returncode:
                    problems.append(f"exit code {python.returncode} vs {frozen.returncode}")
                if python.stderr != frozen.stderr:
                    problems.append("stderr " + first_difference(python.stderr, frozen.stderr))
                if without_file_paths(python.stdout) != without_file_paths(frozen.stdout):
                    problems.append("stdout " + first_difference(python.stdout, frozen.stdout))
                if python.returncode == 0:
                    try:
                        json.loads(frozen.stdout)
                    except ValueError:
                        problems.append("frozen stdout is not valid JSON")
                if frozen.returncode not in (0, 2) and frozen.stderr:
                    problems.append("frozen stderr: " + frozen.stderr.decode(errors="replace")[-300:])

                label = f"{case} {' '.join(flags) or '(no flags)'} -> exit {frozen.returncode}"
                if problems:
                    failures += 1
                    print(f"FAIL  {label}")
                    for problem in problems:
                        print(f"      {problem}")
                else:
                    print(f"ok    {label}")

    print(f"\n{runs - failures}/{runs} runs identical ({len(pairs)} fixture pairs)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
