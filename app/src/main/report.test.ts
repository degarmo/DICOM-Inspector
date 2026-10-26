import { describe, expect, it } from 'vitest'

import { makeResult, makeRow, sampleResult } from '../test/builders'
import { defaultReportName, escapeHtml, REPORT_FOOTER, renderReportHtml } from './report'

const GENERATED = new Date(2026, 9, 26, 14, 5, 9)

describe('renderReportHtml', () => {
  const result = sampleResult()
  const html = renderReportHtml(result, GENERATED)

  it('contains the title and timestamp', () => {
    expect(html).toContain('<title>DICOM diff: a.dcm vs b.dcm</title>')
    expect(html).toContain('2026-10-26 14:05:09')
    expect(html).toContain(`datetime="${GENERATED.toISOString()}"`)
  })

  it('contains both file fingerprints', () => {
    for (const file of [result.files.a, result.files.b]) {
      expect(html).toContain(file.sha256)
      expect(html).toContain(`${file.size_bytes} bytes`)
    }
    expect(html).toContain('<code>a.dcm</code>')
    expect(html).toContain('<code>b.dcm</code>')
    expect(html).toContain('Explicit VR Little Endian')
    expect(html).toContain('1.2.840.10008.1.2.1')
    expect(html).toContain('Secondary Capture Image Storage')
  })

  it('contains the summary counts', () => {
    const { summary } = result
    expect(summary).toMatchObject({ total: 7, identical: 2, different: 3, only_in_a: 1, only_in_b: 1, priority_mismatches: 2 })
    for (const [label, count] of [
      ['Priority mismatches', summary.priority_mismatches],
      ['Identical', summary.identical],
      ['Different', summary.different],
      ['Only in A', summary.only_in_a],
      ['Only in B', summary.only_in_b],
      ['Total', summary.total],
    ] as const) {
      expect(html).toMatch(new RegExp(`<span class="count">${count}</span><span class="label">${label}</span>`))
    }
  })

  it('lists priority mismatches first, then every non-identical row', () => {
    const priorityStart = html.indexOf('<h2>Priority mismatches (2)</h2>')
    const allStart = html.indexOf('<h2>All differences (5)</h2>')
    expect(priorityStart).toBeGreaterThan(-1)
    expect(allStart).toBeGreaterThan(priorityStart)

    const prioritySection = html.slice(priorityStart, allStart)
    expect(prioritySection).toContain('(0008,0050)')
    expect(prioritySection).toContain('SYNTHETIC_VENDOR_1')
    expect(prioritySection).not.toContain('StudyDescription')
    // An identical priority row is not a mismatch.
    expect(prioritySection).not.toContain('TransferSyntaxUID')

    const allSection = html.slice(allStart)
    for (const tag of ['(0008,0050)', '(0008,1030)', '(0008,1155)', '(0009,0010)', '(0010,1000)']) {
      expect(allSection).toContain(tag)
    }
    expect(allSection).not.toContain('ImageType')
    expect(allSection).toContain('LO/SH')
  })

  it('has no external URLs, scripts or remote assets', () => {
    expect(html).not.toMatch(/https?:/i)
    expect(html).not.toMatch(/\/\/[a-z0-9]/i)
    expect(html).not.toMatch(/<script|<link|<img|<iframe|\bsrc=|\bhref=|@import|url\(/i)
    expect(html).toContain("default-src 'none'")
  })

  it('ends with the local-only footer', () => {
    expect(html).toContain(`<footer>${REPORT_FOOTER}</footer>`)
    expect(REPORT_FOOTER).toBe('Generated locally by DICOM Inspector. No data left this machine.')
  })

  it('escapes values taken from the files', () => {
    const hostile = makeResult([
      makeRow({ path: '(0010,0010)', value_a: '<script>alert(1)</script>', value_b: 'x" onload="y', status: 'different' }),
    ])
    const out = renderReportHtml(hostile, GENERATED)
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).toContain('x&quot; onload=&quot;y')
  })

  it('says so when there are no differences', () => {
    const out = renderReportHtml(makeResult([makeRow({ path: '(0010,0020)' })]), GENERATED)
    expect(out).toContain('No priority mismatches.')
    expect(out).toContain('The files have identical headers.')
  })
})

describe('defaultReportName', () => {
  it('uses local time as YYYYMMDD-HHMMSS', () => {
    expect(defaultReportName('html', GENERATED)).toBe('dicom-diff-20261026-140509.html')
    expect(defaultReportName('pdf', GENERATED)).toBe('dicom-diff-20261026-140509.pdf')
  })

  it('escapeHtml covers the five special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
