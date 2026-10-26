# DICOM Inspector

Compare the headers of two DICOM files side by side. Everything runs locally:
files are only read, pixel data is never loaded, and nothing is sent over the
network.

| Directory | What it is                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------- |
| `engine/` | Python comparison engine and CLI. It prints a JSON diff (`schema_version` "1.0"). See [engine/README.md](engine/README.md). |
| `app/`    | Electron + React desktop interface. It runs the engine as a child process and reads its JSON. |

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

## App scripts

Run these from `app/`:

| Script          | What it does                                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| `npm run dev`   | Start Electron with hot reload.                                                   |
| `npm run build` | Build main, preload and renderer into `app/out/`.                                 |
| `npm start`     | Run the built app (`electron-vite preview`).                                      |
| `npm test`      | Vitest: runner, filters, table, app, report, and one real-engine integration test. |
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
  server in dev. All permission requests are denied. Navigation away from the
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
