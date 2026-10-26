# DICOM Inspector

Compare the headers of two DICOM files side by side.

**DICOM Inspector is fully offline.** Files are only read, pixel data is never
loaded, and nothing is sent over the network: no telemetry, no crash reports, no
update checks. The installed app needs no Python or Node.js.

| Directory  | What it is                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `engine/`  | Python comparison engine and CLI. It prints a JSON diff (`schema_version` "1.0"). See [engine/README.md](engine/README.md). `engine/packaging/` freezes it into a standalone executable. |
| `app/`     | Electron + React desktop interface. It runs the engine as a child process and reads its JSON. |
| `build/`   | Windows installer build: `build_windows.ps1`, the CI smoke test and the notices generator.    |
| `docs/`    | [Clean-machine test checklist](docs/CLEAN_MACHINE_TEST.md).                                   |

## Prerequisites (development)

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
tags ([.github/workflows/windows-build.yml](.github/workflows/windows-build.yml)).
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

Before a release, follow [docs/CLEAN_MACHINE_TEST.md](docs/CLEAN_MACHINE_TEST.md)
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
| `npm run lint`  | ESLint plus `tsc --noEmit` (strict) for the main/preload and renderer projects.   |

The integration test runs the real engine. It needs `DICOM_INSPECTOR_PYTHON`
pointing at the engine venv. Without it, the test is skipped and the reason
appears in the test name.

## Using the app

| Action                   | Keyboard (Cmd on macOS) |
| ------------------------ | ----------------------- |
| Open File A              | Ctrl+O                  |
| Open File B              | Ctrl+Shift+O            |
| Compare                  | Ctrl+Enter              |
| Export report            | Ctrl+E                  |

- **Force read (non-standard files)** passes `--force` to the engine, for raw datasets without a preamble.
- The table pins rows for integration-critical tags (and all private tags) in a **Priority** group at the top.
- Click a row to see full values in the details pane. Long values also show in full on hover.
- **Export report** saves a self-contained HTML file or a PDF made from that same HTML.

## Security model

- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  It reaches the main process only through the typed preload API
  (`pickFile`, `compare`, `exportReport`, plus a local `pathForFile` for drag-and-drop).
- IPC handlers reject calls from any frame other than the app page, and validate their arguments.
- The engine is started with `execFile`, an argument array and no shell.
  `--` is placed before the file paths so a path can never be read as a flag.
- Every network request is cancelled in the main process, except the local Vite
  server in dev. All permission requests are denied, and the spellchecker is off. Navigation away from the
  app, `window.open` and `<webview>` are blocked.
- Fonts are bundled from npm (`@fontsource-variable/*`).
- Content Security Policy for the packaged build:

  ```
  default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;
  connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'
  ```

  In `npm run dev`, Vite's hot reload additionally needs `'unsafe-inline'` for
  scripts and styles and `ws://localhost:*` for its websocket. The policy lives in
  `app/src/shared/csp.ts`.
- Exported reports carry their own CSP (`default-src 'none'; style-src 'unsafe-inline'`)
  and contain no scripts or external references.

## Troubleshooting

- **"Comparison engine not available"**: `DICOM_INSPECTOR_PYTHON` is unset or wrong.
  Point it at `engine/.venv/bin/python` (`engine\.venv\Scripts\python.exe` on Windows).
- **Electron starts as a plain Node process** (errors such as `bad option`):
  the shell has `ELECTRON_RUN_AS_NODE=1` set. Some editor-integrated terminals set it.
  Run `unset ELECTRON_RUN_AS_NODE` first.
