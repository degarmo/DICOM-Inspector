# Security model

How DICOM Inspector keeps files local and the app locked down. See also the
[README privacy summary](../README.md#privacy).


- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  It reaches the main process only through the typed preload API: `pickFile`,
  `compare` and `exportReport`; `launchRequest` and `onOpenFiles` for files named
  on the command line; and a local `pathForFile` for drag-and-drop.
- Command-line paths are checked in the main process before the renderer sees them.
  A second launch hands its files to the open window through Electron's
  single-instance lock instead of starting another copy.
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
