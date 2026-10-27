# DICOM Inspector: portfolio text

## Two sentences (resume line or LinkedIn project)

Built DICOM Inspector, an offline Windows desktop tool (Electron, React,
TypeScript, Python and pydicom) that compares the headers of two medical imaging
files and surfaces the few mismatches that break integrations, such as the same
patient ID issued by a different facility. Proved it against 20 synthetic
integration-failure scenarios with golden-file tests run on both the Python
engine and the frozen executable, and packaged it as a one-command Windows
installer with CI install-and-uninstall smoke tests.

## About 120 words (portfolio project card)

When two imaging systems disagree about a study, the cause is usually one header
tag out of hundreds. DICOM Inspector compares two DICOM files tag by tag,
including nested sequences, pins the tags that decide patient and order matching
to the top, and exports a report you can attach to a support ticket. It runs
fully offline: a React and Electron interface drives a local Python engine built
on pydicom, frozen into the installer so no runtime is needed. I proved it with
20 synthetic scenarios drawn from real integration failures, from a stripped
leading zero to a private tag re-encoded by a gateway, each checked against
golden output. Writing those tests uncovered three engine bugs, all fixed with
regression tests.

## Interview talking points

### 1. The real problem

In nuclear cardiology integrations, studies regularly arrive on the wrong patient,
fail to match their order, or get split in two, and the cause hides in the
header: an issuer of patient ID, an accession number that is present but empty, a
regenerated study UID, a character set declared wrong for the bytes. The usual
fix is dumping both files' tags and comparing them by eye. The tool does that
comparison mechanically and ranks the result, so the 1 row that matters is not
lost among 89 that match. Everything shown in demos is synthetic.

### 2. A decision worth defending: a local Python engine, frozen onedir

The comparison engine is a local Python process using pydicom, not a cloud
service or a JavaScript port. Imaging headers carry patient data, so nothing
should leave the machine. pydicom is a mature, widely used open-source DICOM
parser, and a versioned JSON contract between the engine and the UI keeps the
two independently testable. For shipping, I froze the engine with PyInstaller in
onedir mode rather than onefile. Onefile unpacks itself to a temp folder on every
run, which slows each comparison, invites antivirus false positives and leaves
temp files behind; onedir starts immediately and every file can be signed and
verified. The engine sits outside the app's asar archive, because executables
cannot run from inside it.

### 3. How I proved it works

Each of 20 scenarios is a small JSON spec: the change to plant in a synthetic
nuclear cardiology study and the exact rows the engine must report. Golden files
pin the full JSON output byte for byte, and the same tests run against the frozen
executable, which must match the Python engine exactly. Robustness tests cut
files at every byte offset, use 3,000-element headers and Unicode paths. That
work found real bugs: identical private tags under different vendors compared as
equal, and truncated files were silently compared as if complete. CI builds the
installer, installs it silently, runs it with Python removed from PATH, and
uninstalls it.
