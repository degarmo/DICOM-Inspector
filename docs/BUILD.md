# Building and developing DICOM Inspector

Everything needed to run the app from source, test it, and build the Windows
installer. For what the tool does, see the [README](../README.md).

| Directory  | What it is |
| ---------- | ---------- |
| `engine/`  | Python comparison engine and CLI. It prints a JSON diff (`schema_version` "1.0"). See [engine/README.md](../engine/README.md). `engine/packaging/` freezes it into a standalone executable. |
| `app/`     | Electron + React desktop interface. It runs the engine as a child process and reads its JSON. `app/e2e/` holds the Playwright tests and the scripted demo. |
| `build/`   | Windows installer build: `build_windows.ps1`, the CI smoke test and the notices generator. |
| `docs/`    | This guide, the [security model](SECURITY.md), the [clean-machine checklist](CLEAN_MACHINE_TEST.md), the [mismatch catalog](MISMATCH_CATALOG.md) and README images. |
| `demo/`    | Demo pairs, narration script and portfolio text (repo only, not in the installer). |

## Prerequisites

- Python 3.11+
- Node.js 20+ and npm

## Run engine and app together in dev mode

### 1. Set up the engine (once)

```sh
cd engine
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'        # Windows: .venv\Scripts\pip install -e ".[dev]"
.venv/bin/pytest                         # optional; also generates engine/tests/fixtures/
```

### 2. Install the app (once)

```sh
cd app
npm install
```

Electron downloads its binary the first time it starts, not during `npm install`.

### 3. Point the app at the engine's Python and start it

The app runs `<python> -m dicom_inspector` with `engine/` as the working
directory. `DICOM_INSPECTOR_PYTHON` chooses the interpreter (default: `python`).

```sh
cd app
export DICOM_INSPECTOR_PYTHON="$(cd ../engine && pwd)/.venv/bin/python"
npm run dev
```

Windows (PowerShell):

```powershell
cd app
$env:DICOM_INSPECTOR_PYTHON = (Resolve-Path ..\engine\.venv\Scripts\python.exe).Path
npm run dev
```

To try it, drop `engine/tests/fixtures/05_private_block_a.dcm` on File A and
`05_private_block_b.dcm` on File B, then press Ctrl+Enter (Cmd+Enter on macOS).

## Synthetic mismatch scenarios

`engine/tests/scenarios/` proves the tool catches header mismatches that break
real imaging integrations. One synthetic nuclear cardiology baseline (rest/stress
myocardial perfusion, NM Image Storage, fake demographics, a `SYNTH_VENDOR_01`
private block) is turned into 20 file pairs. Each is defined by a JSON spec in
`specs/` listing the planted changes and the exact rows and warnings the engine
must report. All 20 are listed with their real-world symptoms in
[docs/MISMATCH_CATALOG.md](MISMATCH_CATALOG.md). All data is synthetic.

Run the whole engine suite (Phase 1 fixtures, scenarios, goldens, robustness and
regression tests) from `engine/`:

```sh
.venv/bin/pytest                    # everything
.venv/bin/pytest tests/scenarios    # scenarios and golden files only
```

**Golden files.** `tests/scenarios/goldens/<name>.json` holds the full engine
output for each scenario, with `files.*.path` normalized. The tests compare
`python -m dicom_inspector` output to them byte for byte. If the frozen engine
has been built (`engine/dist/`), they also run against it; the pytest header says
which engines ran. A stale or missing golden fails the suite. After an
intentional output change, regenerate them and review the diff:

```sh
.venv/bin/pytest tests/scenarios --update-goldens
git diff tests/scenarios/goldens
```

**Adding a scenario** means adding a spec: copy one in `specs/`, change the
`changes` and `expected` blocks, then run `--update-goldens`. The generator also
has a command line:

```sh
.venv/bin/python tests/scenarios/build_scenarios.py /tmp/pairs   # write every pair as <name>/A.dcm, B.dcm
.venv/bin/python tests/scenarios/build_scenarios.py --demo       # refresh demo/pairs/
.venv/bin/python tests/scenarios/build_scenarios.py --catalog    # refresh docs/MISMATCH_CATALOG.md
```

The app's tests (`npm test` in `app/`) load the same golden outputs to check the
UI: priority pinning, nested paths, the encoding warning banner, the
identical-pair empty state, and HTML reports.

## Build the Windows installer

### Prerequisites

- Windows 10 or 11, x64
- PowerShell 7.2+ (`pwsh`)
- Python 3.11+ (only to build; the installed app does not need it)
- Node.js LTS (22 or 24) and npm
- Git

### One command

From the repo root, in PowerShell 7:

```powershell
pwsh ./build/build_windows.ps1
# or with a specific interpreter:
pwsh ./build/build_windows.ps1 -Python C:\Python312\python.exe
```

The script stops at the first failing step and names it:

1. Freeze the engine (`engine/packaging/build_engine.ps1`). This creates a clean
   venv from `engine/requirements-lock.txt` (exact versions, hash-checked), runs
   PyInstaller in onedir mode, then smoke-tests the exe against two fixtures.
2. Run `engine/packaging/verify_frozen.py`. For every fixture pair, the frozen
   exe's exit code, stderr and stdout must be byte-identical to
   `python -m dicom_inspector`. Only `files.*.path` may differ.
3. Run `npm ci`, `npm test` (including the real-engine integration test) and `npm run lint` in `app/`.
4. Generate `THIRD_PARTY_NOTICES.txt` from the installed Python and npm packages (`build/generate_notices.py`).
5. Build the NSIS installer with electron-builder.
6. Print the installer's path, size, SHA-256 and signature status.

**Output:** `release/DICOM-Inspector-Setup-0.1.0.exe`, about **110 MB**. The
script prints the exact size; it is mostly Electron/Chromium plus a roughly
20 MB frozen engine.

CI runs the same script on `windows-latest` for pushes to `main` and for `v*`
tags ([.github/workflows/windows-build.yml](../.github/workflows/windows-build.yml)).
It then silently installs the result, runs the installed engine with Python
removed from PATH, launches the app, uninstalls it, checks nothing is left
behind, and uploads the installer as an artifact.

### What the installer does

- Installs per user by default, to `%LOCALAPPDATA%\Programs\DICOM Inspector`,
  with no admin rights. The install-mode page also offers "Anyone who uses this
  computer" (`C:\Program Files\DICOM Inspector`, needs UAC).
- Adds a Start menu shortcut. A desktop shortcut is an opt-in checkbox on the
  final page.
- Ships the frozen engine in `resources\engine\` next to `app.asar`, not inside
  it, because executables cannot run from inside an asar archive. The app
  launches it with `windowsHide`, so no console window appears.
- Uninstalling removes the install folder, the shortcuts, the registry entries
  and the app's data folder (`%APPDATA%\DICOM Inspector`).
- No auto-updater, crash reporter or telemetry. The app has no update
  dependency, electron-builder writes no update feed (`publish: null`), Electron's
  crash reporter is never started, and the spellchecker (which would download
  dictionaries) is disabled.

### Code signing

Signing is automatic when a certificate is provided, and skipped otherwise:

```powershell
$env:CSC_LINK = 'C:\path\to\certificate.pfx'   # or a base64-encoded .pfx
$env:CSC_KEY_PASSWORD = '...'
pwsh ./build/build_windows.ps1
```

In CI, set the repository secrets `CSC_LINK` and `CSC_KEY_PASSWORD`. Without
them the build still succeeds and produces an **unsigned** installer. Nothing is
self-signed or faked.

Unsigned installers trigger Windows SmartScreen ("Windows protected your PC").
To run one for testing, click **More info**, then **Run anyway**. If the file
was downloaded, you may first need to right-click it, choose **Properties**,
tick **Unblock** and click OK. For distribution, sign with a code-signing
certificate from a trusted CA. An EV certificate, or a build reputation that
accumulates over time, is what clears SmartScreen.

### Clean-machine check

Before a release, follow [docs/CLEAN_MACHINE_TEST.md](CLEAN_MACHINE_TEST.md)
in Windows Sandbox or a fresh VM with no Python and no Node.js.

## App scripts

Run these from `app/`:

| Script          | What it does                                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| `npm run dev`   | Start Electron with hot reload.                                                   |
| `npm run build` | Build main, preload and renderer into `app/out/`.                                 |
| `npm start`     | Run the built app (`electron-vite preview`).                                      |
| `npm test`      | Vitest: runner, filters, table, app, report, and one real-engine integration test. |
| `npm run dist:win` | Build the Windows installer (expects `engine/dist/` and the notices; use `build/build_windows.ps1`). |
| `npm run icon`  | Regenerate `build/icon.ico` from `build/icon.svg`.                                |
| `npm run lint`  | ESLint plus `tsc --noEmit` (strict) for the main/preload, renderer and e2e projects. |
| `npm run test:e2e` | Build, then drive the real app with Playwright: command-line launch, missing files, second launch. |
| `npm run demo:capture` | Build, run the scripted demo, and regenerate `docs/img/*.png`, `docs/img/demo.gif` and `demo/out/demo-silent.mp4` (needs ffmpeg). |
| `npm run release:checklist` | Print the manual release steps.                                                  |

The integration test runs the real engine. It needs `DICOM_INSPECTOR_PYTHON`
pointing at the engine venv. Without it, the test is skipped and the reason
appears in the test name.

## Demo media

`npm run demo:capture` (in `app/`) drives the built app through the demo pairs with
Playwright at a fixed 1440x900 window, in the light theme plus one dark screenshot.
Before every capture it checks that no home directory, username or host name is
visible. It writes:

- `docs/img/01-loaded.png` to `07-nested-difference.png`: the README screenshots
- `docs/img/demo.gif`: a 15-second loop of the issuer-mismatch walkthrough
- `demo/out/demo-silent.mp4`: the full walkthrough for voiceover (see [demo/SCRIPT.md](../demo/SCRIPT.md)); `demo/out/` is not committed

It needs ffmpeg on PATH (`brew install ffmpeg`, `winget install --id Gyan.FFmpeg`,
or `sudo apt install ffmpeg`) and the engine venv from step 1 above (or
`DICOM_INSPECTOR_PYTHON`).

## Troubleshooting

- **"Comparison engine not available"**: `DICOM_INSPECTOR_PYTHON` is unset or wrong.
  Point it at `engine/.venv/bin/python` (`engine\.venv\Scripts\python.exe` on Windows).
- **Electron starts as a plain Node process** (errors such as `bad option`):
  the shell has `ELECTRON_RUN_AS_NODE=1` set. Some editor-integrated terminals set it.
  Run `unset ELECTRON_RUN_AS_NODE` first.
