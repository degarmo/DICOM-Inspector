# DICOM Inspector demo pack

Three pairs of DICOM files for a recorded walkthrough. Each pair is the same
synthetic nuclear cardiology image (a rest/stress myocardial perfusion study for
the made-up patient `TEST^CARDIO^SYNTH` at "Synthetic Test Hospital") with
exactly one thing changed. Every value is invented: no real patients, sites or
devices. The files contain headers only, no image pixels.

These files live in the repository for demos. They are not part of the installer.

## How to run the demo

1. Start DICOM Inspector (installed, or `npm run dev` in `app/`).
2. Drag `A.dcm` from a pair folder onto **File A** and `B.dcm` onto **File B**
   (or press Ctrl+O and Ctrl+Shift+O).
3. Press **Ctrl+Enter** to compare. Click a row to see its full path and values
   at the bottom of the window.
4. Optional: press **Ctrl+E** to export the HTML report.

Each pair has 90 header elements, and 89 of them match.

## 1. Same patient number, different hospital: `pairs/01_issuer_mismatch/`

Both files say the Patient ID is `00012345`, but A says that number was issued by
`SYNTH-HOSP-A` and B says `SYNTH-HOSP-B`. When hospitals share a PACS or an
enterprise archive, a medical record number only means something together with
the organisation that issued it. Two different people can have the same MRN at
two sites. A system that ignores the issuer can file one patient's scan in
another patient's record, which is a patient-safety incident, not just a data
quality problem. DICOM Inspector shows a red **1 priority mismatch** badge and
pins `IssuerOfPatientID` to the top of the table under **Priority**, with
`SYNTH-HOSP-A` and `SYNTH-HOSP-B` side by side and the status **Different**. The
matching Patient ID is not flagged, which is exactly the trap: everything that
usually gets checked looks fine.

## 2. The order number that is there but empty: `pairs/04_accession_blank/`

A carries the Accession Number `SYNACC000123`, the number that ties an image to
the order in the radiology information system. B still has an Accession Number
field, but it is empty. That is worse than a missing field, because simple
"is the field present?" checks pass, while the RIS has nothing to match on: the
exam never links to its order, the worklist entry stays open, and the report can
end up unattached or unbilled. DICOM Inspector flags it as a **priority
mismatch** with the status **Different**, not "Only in A". It shows
`SYNACC000123` against an explicit **empty** value, so it is clear the field
exists in B and is blank, rather than missing entirely (a separate scenario in
the test suite covers that case).

## 3. A difference buried three levels deep: `pairs/14_nested_three_levels/`

DICOM headers are not flat. Some information sits inside lists nested inside
other lists. Here, the stress agent recorded in the scheduled protocol differs
(`PHARMACOLOGIC STRESS AGENT A` in A, `AGENT B` in B), and that value sits three
levels down: Request Attributes, then Scheduled Protocol Code, then Protocol
Context. Most viewers only show the top level, so a difference like this is easy
to miss. It still matters, because protocol details drive post-processing,
reporting templates and billing. DICOM Inspector finds it and shows the row
indented under a breadcrumb of the sequences it lives in. Clicking the row shows
the full path,
`RequestAttributesSequence[0].ScheduledProtocolCodeSequence[0].ProtocolContextSequence[0].TextValue`,
with both values. It is not a priority tag, so the badge stays green: the tool
separates "worth knowing" from "will break patient matching".

## Regenerating the pairs

The pairs come from the scenario specs in `engine/tests/scenarios/specs/`. To
rebuild them after changing the baseline or a spec:

```sh
cd engine
.venv/bin/python tests/scenarios/build_scenarios.py --demo
```

The engine test suite fails if the committed files no longer match the generator.
See [docs/MISMATCH_CATALOG.md](../docs/MISMATCH_CATALOG.md) for all 20 scenarios.
