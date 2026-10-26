/** HTML reports built from real engine output for scenarios 1, 6 and 14. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseCompareResult } from '../shared/validate'
import { ENGINE_DIR } from './engineCommand'
import { renderReportHtml } from './report'

const SCENARIO_DIR = join(ENGINE_DIR, 'tests', 'scenarios')

interface ExpectedRow {
  path: string
  status: string
  is_priority: boolean
}

function load(name: string): { html: string; expected: ExpectedRow[] } {
  const golden = JSON.parse(readFileSync(join(SCENARIO_DIR, 'goldens', `${name}.json`), 'utf8')) as unknown
  const spec = JSON.parse(readFileSync(join(SCENARIO_DIR, 'specs', `${name}.json`), 'utf8')) as {
    expected: { rows: ExpectedRow[] }
  }
  const html = renderReportHtml(parseCompareResult(golden), new Date(2026, 9, 26, 12, 0, 0))
  return { html, expected: spec.expected.rows }
}

const STATUS_TEXT: Record<string, string> = {
  different: 'Different',
  only_in_a: 'Only in A',
  only_in_b: 'Only in B',
}

describe.each([
  ['01_issuer_mismatch', ['IssuerOfPatientID', 'SYNTH-HOSP-A', 'SYNTH-HOSP-B']],
  ['06_study_uid_regenerated', ['StudyInstanceUID', '2.25.4000', '2.25.4999']],
  [
    '14_nested_three_levels',
    [
      'RequestAttributesSequence[0].ScheduledProtocolCodeSequence[0].ProtocolContextSequence[0].TextValue',
      'PHARMACOLOGIC STRESS AGENT A',
      'PHARMACOLOGIC STRESS AGENT B',
    ],
  ],
])('HTML report for %s', (name, texts) => {
  const { html, expected } = load(name)
  const priorityStart = html.indexOf('<h2>Priority mismatches')
  const allStart = html.indexOf('<h2>All differences')

  it('lists exactly the expected rows, priority ones first', () => {
    const allSection = html.slice(allStart)
    expect(allSection.match(/<tr>\n<td><code>/g) ?? []).toHaveLength(expected.length)
    const prioritySection = html.slice(priorityStart, allStart)
    for (const row of expected) {
      const tag = row.path.slice(-11)
      expect(allSection).toContain(`<code>${tag}</code>`)
      expect(allSection).toContain(STATUS_TEXT[row.status])
      expect(prioritySection.includes(`<code>${tag}</code>`)).toBe(row.is_priority)
    }
    for (const text of texts) expect(allSection).toContain(text)
  })

  it('has no external URLs', () => {
    expect(html).not.toMatch(/https?:|\/\/[a-z0-9]/i)
    expect(html).not.toMatch(/<script|<link|<img|<iframe|\bsrc=|\bhref=|@import|url\(/i)
  })
})
