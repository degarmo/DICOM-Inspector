import { escapeHtml } from './report'

export const ENGINE_MISSING_TITLE = 'Engine not found \u2014 reinstall DICOM Inspector'

/** A static, script-free page shown instead of the app when the packaged engine is missing. */
export function engineMissingHtml(expectedPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${ENGINE_MISSING_TITLE}</title>
<style>
:root{color-scheme:light dark;--bg:#f4f5f7;--fg:#1b1f27;--muted:#5d6573;--danger:#b42318;--panel:#fff;--line:#dcdfe5}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--fg:#e4e7ec;--muted:#a1a8b4;--danger:#f2766b;--panel:#171a20;--line:#2a2f38}}
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:560px;padding:28px 32px;background:var(--panel);border:1px solid var(--line);border-radius:8px}
h1{margin:0 0 8px;font-size:18px;color:var(--danger)}
p{margin:8px 0}
code{display:block;margin-top:4px;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font:12px Consolas,Menlo,monospace;word-break:break-all}
.muted{color:var(--muted)}
</style>
</head>
<body>
<main>
<h1>${ENGINE_MISSING_TITLE}</h1>
<p>The comparison engine that ships with DICOM Inspector is missing, so files cannot be compared.</p>
<p>Uninstall DICOM Inspector, then install it again. Your files are not affected.</p>
<p class="muted">Expected location:<code>${escapeHtml(expectedPath)}</code></p>
</main>
</body>
</html>
`
}

export function engineMissingPage(expectedPath: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(engineMissingHtml(expectedPath))}`
}
