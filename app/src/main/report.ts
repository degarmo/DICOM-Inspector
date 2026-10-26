import type { ExportFormat } from '../shared/api'
import type { CompareResult, FileInfo, Row, Status } from '../shared/schema'

export const REPORT_FOOTER = 'Generated locally by DICOM Inspector. No data left this machine.'

const STATUS_LABELS: Record<Status, { label: string; symbol: string; className: string }> = {
  identical: { label: 'Identical', symbol: '=', className: 'ok' },
  different: { label: 'Different', symbol: '≠', className: 'diff' },
  only_in_a: { label: 'Only in A', symbol: '←', className: 'only-a' },
  only_in_b: { label: 'Only in B', symbol: '→', className: 'only-b' },
}

/** `dicom-diff-YYYYMMDD-HHMMSS.html` in local time. */
export function defaultReportName(format: ExportFormat, date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  return `dicom-diff-${stamp}.${format}`
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function localTimestamp(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  )
}

function value(v: Row['value_a']): string {
  if (v === null) return '<span class="absent">not present</span>'
  const text = Array.isArray(v) ? v.join('\\') : v
  return text === '' ? '<span class="absent">empty</span>' : escapeHtml(text)
}

function uid(info: FileInfo['transfer_syntax']): string {
  if (!info) return '<span class="absent">not present</span>'
  return `${escapeHtml(info.name)}<br><code>${escapeHtml(info.uid)}</code>`
}

function fingerprints(result: CompareResult): string {
  const { a, b } = result.files
  const row = (label: string, cellA: string, cellB: string): string =>
    `<tr><th scope="row">${label}</th><td>${cellA}</td><td>${cellB}</td></tr>`
  return `<table class="kv">
<thead><tr><th></th><th scope="col">File A</th><th scope="col">File B</th></tr></thead>
<tbody>
${row('Name', `<code>${escapeHtml(fileName(a.path))}</code>`, `<code>${escapeHtml(fileName(b.path))}</code>`)}
${row('Size', `${a.size_bytes.toLocaleString('en-US')} bytes`, `${b.size_bytes.toLocaleString('en-US')} bytes`)}
${row('SHA-256', `<code class="hash">${escapeHtml(a.sha256)}</code>`, `<code class="hash">${escapeHtml(b.sha256)}</code>`)}
${row('Transfer Syntax', uid(a.transfer_syntax), uid(b.transfer_syntax))}
${row('SOP Class', uid(a.sop_class), uid(b.sop_class))}
</tbody>
</table>`
}

function summary(result: CompareResult): string {
  const s = result.summary
  const cell = (label: string, count: number, className = ''): string =>
    `<div class="stat ${className}"><span class="count">${count}</span><span class="label">${label}</span></div>`
  return `<div class="stats">
${cell('Priority mismatches', s.priority_mismatches, s.priority_mismatches > 0 ? 'alert' : '')}
${cell('Identical', s.identical)}
${cell('Different', s.different)}
${cell('Only in A', s.only_in_a)}
${cell('Only in B', s.only_in_b)}
${cell('Total', s.total)}
</div>`
}

function rowsTable(rows: readonly Row[], emptyText: string): string {
  if (rows.length === 0) return `<p class="empty">${emptyText}</p>`
  const body = rows
    .map((r) => {
      const status = STATUS_LABELS[r.status]
      const keyword = r.is_private
        ? `<span class="tag">Private</span> ${escapeHtml(r.private_creator ?? 'no private creator')}<br><code class="path">${escapeHtml(r.keyword_path)}</code>`
        : escapeHtml(r.keyword_path)
      const vr = r.vr_mismatch ? `<strong>${escapeHtml(`${r.vr_a}/${r.vr_b}`)}</strong> (mismatch)` : escapeHtml(r.vr)
      return `<tr>
<td><code>${escapeHtml(r.tag)}</code>${r.is_priority ? ' <span class="prio">Priority</span>' : ''}</td>
<td>${keyword}</td>
<td><code>${vr}</code></td>
<td class="value">${value(r.value_a)}</td>
<td class="value">${value(r.value_b)}</td>
<td class="status ${status.className}">${status.symbol} ${status.label}</td>
</tr>`
    })
    .join('\n')
  return `<table class="rows">
<thead><tr><th>Tag</th><th>Keyword path</th><th>VR</th><th>Value A</th><th>Value B</th><th>Status</th></tr></thead>
<tbody>
${body}
</tbody>
</table>`
}

function warnings(result: CompareResult): string {
  if (result.warnings.length === 0) return ''
  const items = result.warnings
    .map(
      (w) =>
        `<li>${w.file ? `<strong>File ${w.file.toUpperCase()}</strong> ` : ''}${w.path ? `<code>${escapeHtml(w.path)}</code> ` : ''}${escapeHtml(w.message)}</li>`,
    )
    .join('\n')
  return `<section><h2>Warnings (${result.warnings.length})</h2><ul class="warnings">${items}</ul></section>`
}

const STYLES = `
*{box-sizing:border-box}
body{margin:0;padding:24px 28px;font:12px/1.45 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1b1f27;background:#fff}
h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #dcdfe5}
.meta{color:#5d6573;margin:0}
code{font-family:"JetBrains Mono",Menlo,Consolas,monospace;font-size:11px}
.hash{word-break:break-all}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e5e7eb}
thead th{background:#f1f3f6;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#5d6573}
.kv th[scope=row]{width:130px;color:#5d6573;font-weight:600}
.kv td{width:44%}
.rows td.value{font-family:"JetBrains Mono",Menlo,Consolas,monospace;font-size:11px;word-break:break-all;max-width:320px}
.rows tr{page-break-inside:avoid}
.absent{color:#8a919d;font-style:italic;font-family:inherit}
.path{color:#5d6573}
.stats{display:flex;gap:8px;flex-wrap:wrap}
.stat{border:1px solid #dcdfe5;border-radius:6px;padding:6px 12px;min-width:96px}
.stat .count{display:block;font-size:18px;font-weight:700}
.stat .label{color:#5d6573;font-size:11px}
.stat.alert{border-color:#e7a19a;background:#fde8e6;color:#b42318}
.stat.alert .label{color:#b42318}
.tag,.prio{display:inline-block;font-size:9px;font-weight:700;text-transform:uppercase;border:1px solid #c4c9d2;border-radius:3px;padding:0 3px;color:#5d6573}
.prio{border-color:#e7a19a;color:#b42318}
.status{white-space:nowrap;font-weight:600}
.status.ok{color:#1d7a46}.status.diff{color:#9a5b00}.status.only-a{color:#6b3fb8}.status.only-b{color:#0b6f8a}
.empty{color:#5d6573}
.warnings{margin:0;padding-left:18px;color:#8a5a00}
footer{margin-top:28px;padding-top:8px;border-top:1px solid #dcdfe5;color:#5d6573}
@page{size:A4 landscape;margin:12mm}
@media print{body{padding:0}}
`

/** A self-contained HTML report: inline CSS, no scripts, no external assets. */
export function renderReportHtml(result: CompareResult, generatedAt: Date): string {
  const differences = result.rows.filter((r) => r.status !== 'identical')
  const priority = differences.filter((r) => r.is_priority)
  const title = `DICOM diff: ${fileName(result.files.a.path)} vs ${fileName(result.files.b.path)}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Generated <time datetime="${generatedAt.toISOString()}">${localTimestamp(generatedAt)}</time> by DICOM Inspector (engine schema ${escapeHtml(result.schema_version)})</p>
</header>
<section><h2>Files</h2>${fingerprints(result)}</section>
<section><h2>Summary</h2>${summary(result)}</section>
${warnings(result)}
<section><h2>Priority mismatches (${priority.length})</h2>${rowsTable(priority, 'No priority mismatches.')}</section>
<section><h2>All differences (${differences.length})</h2>${rowsTable(differences, 'The files have identical headers.')}</section>
<footer>${REPORT_FOOTER}</footer>
</body>
</html>
`
}
