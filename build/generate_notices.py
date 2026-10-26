"""Generate THIRD_PARTY_NOTICES.txt for the Windows installer.

Covers everything that ships inside the installer:

* the frozen engine: the Python runtime, pydicom, and PyInstaller's bootloader,
  read from the Python environment that froze the engine (run this script with
  that interpreter, i.e. engine/.build-venv);
* the app: Electron, plus every npm production dependency bundled into the
  renderer, read from app/package-lock.json and app/node_modules.

Every component must have license text on disk; a missing one fails the build.

Usage:
    python build/generate_notices.py [--output app/build/THIRD_PARTY_NOTICES.txt]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
DEFAULT_OUTPUT = APP_DIR / "build" / "THIRD_PARTY_NOTICES.txt"

# Python distributions whose code is inside the frozen engine.
PYTHON_DISTRIBUTIONS = {
    "pydicom": "DICOM parsing library used by the comparison engine.",
    "pyinstaller": "Only its bootloader ships (the engine's .exe launcher), under the GPL bootloader exception.",
}
# npm packages that ship even though they are devDependencies of the build.
EXTRA_NPM_PACKAGES = {
    "electron": "Application runtime. Chromium's own notices ship as LICENSES.chromium.html in the install folder.",
}
LICENSE_NAMES = ("LICENSE", "LICENCE", "COPYING", "NOTICE")
RULE = "=" * 78


@dataclass
class Component:
    name: str
    version: str
    license: str
    homepage: str
    note: str
    texts: list[tuple[str, str]]


class NoticeError(Exception):
    pass


def is_license_file(name: str) -> bool:
    upper = name.upper()
    return any(upper.startswith(prefix) for prefix in LICENSE_NAMES)


def python_runtime() -> Component:
    base = Path(sys.base_prefix)
    candidates = [
        base / "LICENSE.txt",
        base / "Lib" / "LICENSE.txt",
        base / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "LICENSE.txt",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return Component(
                name="Python",
                version=sys.version.split()[0],
                license="PSF-2.0",
                homepage="https://www.python.org/",
                note="Interpreter and standard library embedded in the frozen engine.",
                texts=[(candidate.name, candidate.read_text(encoding="utf-8", errors="replace"))],
            )
    raise NoticeError(f"Python license not found; looked in: {', '.join(map(str, candidates))}")


def python_distribution(name: str, note: str) -> Component:
    try:
        dist = metadata.distribution(name)
    except metadata.PackageNotFoundError as exc:
        raise NoticeError(f"Python package {name!r} is not installed in {sys.prefix}; run with the build venv") from exc
    texts = []
    for file in dist.files or []:
        if is_license_file(Path(file).name):
            texts.append((str(file), Path(dist.locate_file(file)).read_text(encoding="utf-8", errors="replace")))
    if not texts:
        raise NoticeError(f"No license file found for Python package {name}")
    meta = dist.metadata
    license_name = meta.get("License-Expression") or meta.get("License") or ""
    if not license_name or len(license_name) > 80:
        classifiers = [c.split(" :: ")[-1] for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
        license_name = ", ".join(classifiers) or "see license text"
    urls = meta.get_all("Project-URL") or []
    homepage = meta.get("Home-page") or (urls[0].split(", ", 1)[-1] if urls else "")
    return Component(dist.metadata["Name"], dist.version, license_name, homepage, note, sorted(texts))


def npm_package(name: str, note: str = "") -> Component:
    package_dir = APP_DIR / "node_modules" / name
    manifest_path = package_dir / "package.json"
    if not manifest_path.is_file():
        raise NoticeError(f"npm package {name} is not installed; run npm ci in app/ first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    texts = [
        (path.name, path.read_text(encoding="utf-8", errors="replace"))
        for path in sorted(package_dir.iterdir())
        if path.is_file() and is_license_file(path.name)
    ]
    if not texts:
        raise NoticeError(f"No license file found for npm package {name}")
    license_name = manifest.get("license")
    if isinstance(license_name, dict):
        license_name = license_name.get("type", "")
    repository = manifest.get("repository")
    homepage = manifest.get("homepage") or (repository.get("url", "") if isinstance(repository, dict) else repository or "")
    return Component(name, manifest["version"], license_name or "see license text", homepage, note, texts)


def npm_production_packages() -> list[str]:
    lock = json.loads((APP_DIR / "package-lock.json").read_text(encoding="utf-8"))
    names = set()
    for key, entry in lock["packages"].items():
        if not key.startswith("node_modules/") or entry.get("dev"):
            continue
        names.add(key.rsplit("node_modules/", 1)[1])
    return sorted(names)


def render(components: list[Component]) -> str:
    lines = [
        "DICOM Inspector - Third-Party Notices",
        "",
        "DICOM Inspector includes the third-party software listed below. Each",
        "component is distributed under its own license, reproduced in full.",
        "This file was generated by build/generate_notices.py.",
        "",
        "Components:",
    ]
    lines += [f"  - {c.name} {c.version} ({c.license})" for c in components]
    for c in components:
        lines += ["", RULE, f"{c.name} {c.version}", f"License: {c.license}"]
        if c.homepage:
            lines.append(f"Homepage: {c.homepage}")
        if c.note:
            lines.append(c.note)
        lines.append(RULE)
        for filename, text in c.texts:
            lines += ["", f"--- {filename} ---", "", text.strip()]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate THIRD_PARTY_NOTICES.txt")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    try:
        components = [python_runtime()]
        components += [python_distribution(name, note) for name, note in PYTHON_DISTRIBUTIONS.items()]
        components += [npm_package(name, note) for name, note in EXTRA_NPM_PACKAGES.items()]
        components += [npm_package(name) for name in npm_production_packages()]
    except NoticeError as exc:
        print(f"generate_notices: {exc}", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render(components), encoding="utf-8", newline="\n")
    print(f"Wrote {args.output} ({len(components)} components)")
    for c in components:
        print(f"  {c.name} {c.version} ({c.license})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
