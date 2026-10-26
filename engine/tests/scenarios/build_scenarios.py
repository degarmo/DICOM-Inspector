"""Build synthetic mismatch scenarios from one nuclear cardiology baseline.

Every scenario is a JSON spec in specs/: a name, a description, the changes to
plant in file A and/or B, and the diff rows the engine must report. This module
turns a spec into a pair of DICOM files; adding a scenario means adding a spec.

All values are synthetic: no real patients, sites or devices.

Usage:
    python tests/scenarios/build_scenarios.py OUTPUT_DIR [--only NAME ...]
    python tests/scenarios/build_scenarios.py --demo       # refresh demo/pairs/
    python tests/scenarios/build_scenarios.py --catalog    # refresh docs/MISMATCH_CATALOG.md

Change operations ("file" is "a", "b" or "both"):
    {"op": "set", "path": P, "value": V, "vr": optional VR}  set or add an element
    {"op": "delete", "path": P}                              remove an element
    {"op": "append_item", "path": P, "item": {...}}          add a sequence item
    {"op": "private_block", "group": "0029", "creator": C,
     "elements": [{"offset": 1, "vr": "LO", "value": V}]}    add a private block
    {"op": "patch_bytes", "find": S, "replace": S}           edit the written file
                                                             (same length, one match)
Paths use keywords or "(gggg,eeee)" tags with item indexes, e.g.
"RequestAttributesSequence[0].ScheduledProtocolCodeSequence[0].CodeMeaning".
Values: strings, numbers, lists of strings (multi-valued), {"hex": "..."} for
bytes, and lists of objects (keyword -> value) for sequences.
A spec may set "transfer_syntax": {"a": UID, "b": UID}; the default is
Explicit VR Little Endian.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from pydicom.datadict import dictionary_VR, tag_for_keyword
from pydicom.dataset import Dataset
from pydicom.sequence import Sequence
from pydicom.tag import BaseTag, Tag
from pydicom.uid import UID, ExplicitVRLittleEndian, NuclearMedicineImageStorage

HERE = Path(__file__).resolve().parent
ENGINE_DIR = HERE.parent.parent
REPO_DIR = ENGINE_DIR.parent
SPEC_DIR = HERE / "specs"
GOLDEN_DIR = HERE / "goldens"
DEMO_DIR = REPO_DIR / "demo" / "pairs"
CATALOG_PATH = REPO_DIR / "docs" / "MISMATCH_CATALOG.md"
DEMO_SCENARIOS = ("01_issuer_mismatch", "04_accession_blank", "14_nested_three_levels")

sys.path.insert(0, str(ENGINE_DIR / "tests"))
from make_fixtures import write  # noqa: E402

STUDY_UID = "2.25.4000"
REST_SERIES_UID = "2.25.4100"
STRESS_SERIES_UID = "2.25.4200"
PRIVATE_GROUP = 0x0019
PRIVATE_CREATOR = "SYNTH_VENDOR_01"

OPS = {"set", "delete", "append_item", "private_block", "patch_bytes"}
SEGMENT = re.compile(r"^(?P<name>[A-Za-z][A-Za-z0-9]*|\([0-9A-Fa-f]{4},[0-9A-Fa-f]{4}\))(?:\[(?P<index>\d+)\])?$")


def code(value: str, meaning: str) -> Dataset:
    item = Dataset()
    item.CodeValue = value
    item.CodingSchemeDesignator = "99SYNTH"
    item.CodeMeaning = meaning
    return item


def energy_window(name: str, lower: str, upper: str) -> Dataset:
    limits = Dataset()
    limits.EnergyWindowLowerLimit = lower
    limits.EnergyWindowUpperLimit = upper
    window = Dataset()
    window.EnergyWindowRangeSequence = Sequence([limits])
    window.EnergyWindowName = name
    return window


def baseline() -> Dataset:
    """One image of the rest series of a synthetic rest/stress myocardial perfusion study."""
    ds = Dataset()
    ds.SpecificCharacterSet = "ISO_IR 100"
    ds.ImageType = ["ORIGINAL", "PRIMARY", "RECON TOMO", "EMISSION"]
    ds.SOPClassUID = NuclearMedicineImageStorage
    ds.SOPInstanceUID = "2.25.4101"
    ds.StudyDate = "20250314"
    ds.SeriesDate = "20250314"
    ds.StudyTime = "081530"
    ds.SeriesTime = "083000"
    ds.AccessionNumber = "SYNACC000123"
    ds.Modality = "NM"
    ds.Manufacturer = "Synthetic Imaging Co"
    ds.InstitutionName = "Synthetic Test Hospital"
    ds.ReferringPhysicianName = "SYNTH^REFERRER^A"
    ds.StationName = "SYNTH-NM-01"
    ds.StudyDescription = "MYOCARDIAL PERFUSION REST/STRESS"
    ds.SeriesDescription = "REST TOMO"
    ds.ManufacturerModelName = "SYNTH GAMMA 1000"

    referenced_study = Dataset()
    referenced_study.ReferencedSOPClassUID = "1.2.840.10008.3.1.2.3.1"
    referenced_study.ReferencedSOPInstanceUID = "2.25.4900"
    ds.ReferencedStudySequence = Sequence([referenced_study])

    stress = Dataset()
    stress.StudyInstanceUID = STUDY_UID
    stress.SeriesInstanceUID = STRESS_SERIES_UID
    stress.PurposeOfReferenceCodeSequence = Sequence([code("SYN-STRESS", "Paired stress acquisition")])
    ds.RelatedSeriesSequence = Sequence([stress])

    ds.PatientName = "TEST^CARDIO^SYNTH"
    ds.PatientID = "00012345"
    ds.IssuerOfPatientID = "SYNTH-HOSP-A"
    ds.PatientBirthDate = "19600101"
    ds.PatientSex = "O"
    ds.DeviceSerialNumber = "SYNTH-SN-0001"
    ds.SoftwareVersions = "SYNTH 1.0"
    ds.StudyInstanceUID = STUDY_UID
    ds.SeriesInstanceUID = REST_SERIES_UID
    ds.StudyID = "SYN001"
    ds.SeriesNumber = "1"
    ds.InstanceNumber = "1"
    ds.FrameOfReferenceUID = "2.25.4300"

    context = Dataset()
    context.ValueType = "TEXT"
    context.ConceptNameCodeSequence = Sequence([code("SYN-AGENT", "Stress agent")])
    context.TextValue = "PHARMACOLOGIC STRESS AGENT A"
    protocol = code("SYN-MPI", "Myocardial perfusion rest/stress")
    protocol.ProtocolContextSequence = Sequence([context])
    request = Dataset()
    request.RequestedProcedureID = "SYNRP001"
    request.ScheduledProcedureStepID = "SYNSPS001"
    request.ScheduledProtocolCodeSequence = Sequence([protocol])
    ds.RequestAttributesSequence = Sequence([request])

    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows = 64
    ds.Columns = 64
    ds.PixelSpacing = ["6.8", "6.8"]
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0

    ds.EnergyWindowInformationSequence = Sequence(
        [energy_window("TC99M PEAK", "126.45", "154.55"), energy_window("SCATTER", "112.0", "126.0")]
    )
    radiopharmaceutical = Dataset()
    radiopharmaceutical.Radiopharmaceutical = "SYNTHETIC TRACER A"
    radiopharmaceutical.RadionuclideTotalDose = "1110"
    radiopharmaceutical.RadionuclideCodeSequence = Sequence([code("SYN-TC99M", "Synthetic radionuclide")])
    ds.RadiopharmaceuticalInformationSequence = Sequence([radiopharmaceutical])

    block = ds.private_block(PRIVATE_GROUP, PRIVATE_CREATOR, create=True)
    block.add_new(0x01, "LO", "SYNTH ACQ PROFILE")
    block.add_new(0x02, "DS", "1.25")
    block.add_new(0x03, "OB", bytes(range(8)))
    return ds


class SpecError(ValueError):
    pass


def load_specs(names: Iterable[str] | None = None) -> list[dict[str, Any]]:
    specs = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(SPEC_DIR.glob("*.json"))]
    for spec, path in zip(specs, sorted(SPEC_DIR.glob("*.json"))):
        validate_spec(spec, path.stem)
    if names:
        wanted = set(names)
        specs = [s for s in specs if s["name"] in wanted]
        missing = wanted - {s["name"] for s in specs}
        if missing:
            raise SpecError(f"unknown scenario(s): {', '.join(sorted(missing))}")
    return specs


def validate_spec(spec: dict[str, Any], stem: str) -> None:
    for key in ("name", "title", "description", "symptom", "changes", "expected"):
        if key not in spec:
            raise SpecError(f"{stem}: missing '{key}'")
    if spec["name"] != stem:
        raise SpecError(f"{stem}: name '{spec['name']}' must match the file name")
    for change in spec["changes"]:
        if change.get("op") not in OPS:
            raise SpecError(f"{stem}: unknown op {change.get('op')!r}")
        if change.get("file") not in ("a", "b", "both"):
            raise SpecError(f"{stem}: change needs file 'a', 'b' or 'both': {change}")
    for row in spec["expected"]["rows"]:
        if not {"path", "status", "is_priority"} <= row.keys():
            raise SpecError(f"{stem}: expected rows need path, status and is_priority: {row}")


def parse_tag(name: str) -> BaseTag:
    if name.startswith("("):
        return Tag(int(name[1:5], 16), int(name[6:10], 16))
    tag = tag_for_keyword(name)
    if tag is None:
        raise SpecError(f"unknown keyword {name!r}")
    return Tag(tag)


def resolve(ds: Dataset, path: str) -> tuple[Dataset, BaseTag]:
    """Walk a path down to (parent dataset, tag of the last segment)."""
    segments = path.split(".")
    current = ds
    for segment in segments[:-1]:
        match = SEGMENT.match(segment)
        if not match or match["index"] is None:
            raise SpecError(f"bad path segment {segment!r} in {path!r}; sequences need [index]")
        current = current[parse_tag(match["name"])].value[int(match["index"])]
    match = SEGMENT.match(segments[-1])
    if not match or match["index"] is not None:
        raise SpecError(f"bad final path segment {segments[-1]!r} in {path!r}")
    return current, parse_tag(match["name"])


def to_value(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"hex"}:
        return bytes.fromhex(value["hex"])
    if isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
        return Sequence([to_dataset(item) for item in value])
    return value


def to_dataset(item: dict[str, Any]) -> Dataset:
    ds = Dataset()
    for keyword, value in item.items():
        setattr(ds, keyword, to_value(value))
    return ds


def apply_change(ds: Dataset, change: dict[str, Any], patches: list[tuple[bytes, bytes]]) -> None:
    op = change["op"]
    if op == "set":
        parent, tag = resolve(ds, change["path"])
        value = to_value(change["value"])
        if "vr" in change:
            parent.add_new(tag, change["vr"], value)
        elif tag in parent:
            parent[tag].value = value
        else:
            parent.add_new(tag, dictionary_VR(tag), value)
    elif op == "delete":
        parent, tag = resolve(ds, change["path"])
        del parent[tag]
    elif op == "append_item":
        parent, tag = resolve(ds, change["path"])
        parent[tag].value.append(to_dataset(change["item"]))
    elif op == "private_block":
        block = ds.private_block(int(change["group"], 16), change["creator"], create=True)
        for element in change["elements"]:
            block.add_new(element["offset"], element["vr"], to_value(element["value"]))
    elif op == "patch_bytes":
        find, replace = change["find"].encode("latin-1"), change["replace"].encode("latin-1")
        if len(find) != len(replace):
            raise SpecError(f"patch_bytes must keep the length: {change}")
        patches.append((find, replace))


def build_pair(spec: dict[str, Any], out_dir: Path) -> tuple[Path, Path]:
    """Write <out_dir>/<name>/A.dcm and B.dcm for one scenario."""
    datasets = {"a": baseline(), "b": baseline()}
    patches: dict[str, list[tuple[bytes, bytes]]] = {"a": [], "b": []}
    for change in spec["changes"]:
        for label in ("a", "b") if change["file"] == "both" else (change["file"],):
            apply_change(datasets[label], change, patches[label])

    pair_dir = out_dir / spec["name"]
    pair_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for label in ("a", "b"):
        syntax = UID(spec.get("transfer_syntax", {}).get(label, ExplicitVRLittleEndian))
        path = write(datasets[label], pair_dir / f"{label.upper()}.dcm", syntax)
        if patches[label]:
            data = path.read_bytes()
            for find, replace in patches[label]:
                if data.count(find) != 1:
                    raise SpecError(f"{spec['name']}: patch target {find!r} must occur exactly once")
                data = data.replace(find, replace)
            path.write_bytes(data)
        paths.append(path)
    return paths[0], paths[1]


def render_catalog(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Mismatch catalog",
        "",
        "The 20 synthetic scenarios in `engine/tests/scenarios/`. Each one plants a",
        "header mismatch that breaks real imaging integrations into a copy of a",
        "synthetic nuclear cardiology study, and the test suite checks that DICOM",
        "Inspector reports exactly that difference.",
        "",
        "Generated from the scenario specs by `python engine/tests/scenarios/build_scenarios.py --catalog`.",
        "",
        "| # | Scenario | What changed | Real-world symptom | Priority |",
        "| - | -------- | ------------ | ------------------ | -------- |",
    ]
    for index, spec in enumerate(specs, start=1):
        rows = spec["expected"]["rows"]
        if not rows:
            priority = "n/a (no differences)"
        elif any(r["is_priority"] for r in rows):
            priority = "Yes"
        else:
            priority = "No"
        cells = [str(index), f"**{spec['title']}** (`{spec['name']}`)", spec["description"], spec["symptom"], priority]
        lines.append("| " + " | ".join(c.replace("|", "\\|") for c in cells) + " |")
    lines += [
        "",
        "Priority means at least one reported row has `is_priority: true`: an",
        "integration-critical tag (patient and study identity, UIDs, SOP Class,",
        "dates, character set, transfer syntax) or any private tag.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build synthetic scenario file pairs.")
    parser.add_argument("output", nargs="?", type=Path, help="Directory for <name>/A.dcm and B.dcm.")
    parser.add_argument("--only", nargs="+", metavar="NAME", help="Build only these scenarios.")
    parser.add_argument("--demo", action="store_true", help=f"Refresh the demo pairs in {DEMO_DIR}.")
    parser.add_argument("--catalog", action="store_true", help=f"Refresh {CATALOG_PATH}.")
    args = parser.parse_args(argv)

    if args.catalog:
        CATALOG_PATH.write_text(render_catalog(load_specs()), encoding="utf-8")
        print(f"Wrote {CATALOG_PATH}")
    if args.demo:
        for spec in load_specs(DEMO_SCENARIOS):
            a, b = build_pair(spec, DEMO_DIR)
            print(f"{spec['name']}: {a.relative_to(REPO_DIR)} {b.relative_to(REPO_DIR)}")
    if args.output:
        for spec in load_specs(args.only):
            a, b = build_pair(spec, args.output)
            print(f"{spec['name']}: {a} {b}")
    if not (args.output or args.demo or args.catalog):
        parser.error("give an output directory, --demo or --catalog")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
