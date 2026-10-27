# DICOM Inspector 0.1.0

The first release of DICOM Inspector, a desktop tool that compares the headers
of two DICOM files and shows the differences that break imaging integrations.

## What it does

- Compares every header tag of two DICOM files: file meta, the main dataset and
  all nested sequences, flattened into one table with readable paths.
- Pins integration-critical tags (patient ID and issuer, accession number,
  study, series and SOP Instance UIDs, SOP Class, study date and time, character
  set, transfer syntax) and all private tags to the top as priority rows, with a
  count of priority mismatches.
- Filters by status, priority and text; "Differences only" is on by default.
- Tells an empty value apart from a missing tag, reports VR mismatches, decodes
  text using each file's Specific Character Set, and warns about undecodable
  text instead of failing.
- Rejects empty, truncated and non-DICOM files with a clear message naming the
  file. A "Force read" option reads raw datasets that lack the DICOM preamble.
- Exports a self-contained HTML report, or a PDF of the same report, with file
  fingerprints (size, SHA-256, transfer syntax, SOP Class), summary counts,
  priority mismatches first, then every difference.
- Keyboard shortcuts, drag and drop, light and dark themes, and a command line:
  `"DICOM Inspector.exe" A.dcm B.dcm --compare`. A second launch loads its files
  into the window that is already open.

## What's in the box

- `DICOM-Inspector-Setup-0.1.0.exe`: a Windows installer (x64). It installs the
  app and its own comparison engine, so no Python or other runtime is needed.
  It installs per user by default, with an option for all users, adds a Start
  menu shortcut (desktop shortcut optional), and uninstalls cleanly.
- `THIRD_PARTY_NOTICES.txt` in the install folder, with the licenses of every
  bundled component.
- In the repository: three synthetic demo pairs (`demo/pairs/`), the 20-scenario
  mismatch catalog (`docs/MISMATCH_CATALOG.md`), and full build instructions
  (`docs/BUILD.md`).

## Privacy

Fully offline. Files are opened read-only, only headers are read (never pixel
data), and the app makes no network requests: no telemetry, crash reports or
update checks. All demo and test data is synthetic.

## Known limitations

- **Windows only.** The installer targets Windows 10 and 11 (x64). The app runs
  from source on other platforms for development, but no other installers are
  provided.
- **Unsigned.** The installer is not code-signed, so Windows SmartScreen warns
  before running it. Choose **More info**, then **Run anyway**.
- **Header-only.** Pixel data is not compared or loaded.
- **Two files at a time.** There is no batch or folder comparison.
- When a private tag's private creator differs between the files, the row is
  marked as different, but its creator column shows file A's creator only. The
  creator element's own row shows both values.
- A file cut off exactly between two elements is a valid, shorter DICOM file, so
  it is compared normally and its missing elements appear as "Only in A". Files
  cut inside an element are rejected as truncated.

## Verify your download

The SHA-256 checksum of the installer is published on the release page. In
PowerShell:

```powershell
Get-FileHash .\DICOM-Inspector-Setup-0.1.0.exe -Algorithm SHA256
```

The hash printed must match the one on the release page.
