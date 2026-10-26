import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { InspectorApi } from '../../../shared/api'
import { at } from '../../../test/builders'
import { App } from '../App'
import { DEFAULT_FILTERS, filterRows } from '../lib/filters'
import { SCENARIO_NAMES, scenarioResult } from '../test/scenarioResults'
import { DiffTable } from './DiffTable'

const sizes = [
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(2000),
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400),
]
afterAll(() => sizes.forEach((spy) => spy.mockRestore()))

function renderScenarioTable(name: string): void {
  const rows = filterRows(scenarioResult(name).rows, DEFAULT_FILTERS)
  render(<DiffTable rows={rows} selectedPath={null} onSelect={() => undefined} />)
}

/** Load a scenario's real engine output into the full app through the mocked preload API. */
async function renderScenarioInApp(): Promise<void> {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose File A' }))
  await userEvent.click(screen.getByRole('button', { name: 'Choose File B' }))
  await screen.findByText('B.dcm')
  await userEvent.click(screen.getByRole('button', { name: /Compare/ }))
  await screen.findByTestId('priority-mismatches')
  expect(window.inspector.compare).toHaveBeenCalledOnce()
}

beforeEach(() => {
  window.inspector = {
    pickFile: vi
      .fn()
      .mockResolvedValueOnce({ path: '/scenario/A.dcm', name: 'A.dcm', size: 2048 })
      .mockResolvedValueOnce({ path: '/scenario/B.dcm', name: 'B.dcm', size: 2048 }),
    compare: vi.fn(),
    exportReport: vi.fn(),
    pathForFile: vi.fn(),
  } as unknown as InspectorApi
})

describe('scenario results in the UI', () => {
  it('accepts the real engine output of all 20 scenarios', () => {
    expect(SCENARIO_NAMES).toHaveLength(20)
    for (const name of SCENARIO_NAMES) expect(scenarioResult(name).schema_version).toBe('1.0')
  })

  it('pins priority mismatches above other differences (08: SOP Class)', () => {
    renderScenarioTable('08_sop_class_differs')
    const rows = screen.getAllByTestId('diff-row')
    // The engine lists (0002,0002) first; the priority (0008,0016) row is pinned above it.
    expect(rows.map((row) => row.getAttribute('data-path'))).toEqual(['(0008,0016)', '(0002,0002)'])
    expect(screen.getByTestId('group-priority')).toHaveTextContent('Priority1')
    expect(screen.getByTestId('group-other')).toHaveTextContent('Other rows1')
    const pinned = at(rows, 0)
    expect(within(pinned).getByRole('img', { name: 'Priority' })).toBeInTheDocument()
    expect(within(pinned).getByText('SOPClassUID')).toBeInTheDocument()
    expect(pinned.lastElementChild).toHaveTextContent('Different')
  })

  it('labels every priority row in a mixed scenario (18: transfer syntax)', () => {
    renderScenarioTable('18_explicit_vs_implicit_vr')
    const rows = screen.getAllByTestId('diff-row')
    const paths = rows.map((row) => row.getAttribute('data-path'))
    expect(paths).toEqual(['(0002,0010)', '(0019,1001)', '(0019,1002)', '(0019,1003)', '(0002,0000)'])
    for (const row of rows.slice(0, 4)) {
      expect(within(row).getByRole('img', { name: 'Priority' })).toBeInTheDocument()
      expect(row.lastElementChild).toHaveTextContent('Different')
    }
    expect(screen.getAllByLabelText('VR mismatch')).toHaveLength(3)
    expect(screen.getAllByTestId('private-creator').map((el) => el.textContent)).toEqual([
      'SYNTH_VENDOR_01',
      'SYNTH_VENDOR_01',
      'SYNTH_VENDOR_01',
    ])
  })

  it('shows a readable, indented path for a difference three sequences deep (14)', () => {
    renderScenarioTable('14_nested_three_levels')
    const row = at(screen.getAllByTestId('diff-row'), 0)
    const pathCell = within(row).getByTitle(
      'RequestAttributesSequence[0].ScheduledProtocolCodeSequence[0].ProtocolContextSequence[0].TextValue',
    )
    expect(pathCell).toHaveTextContent(
      'RequestAttributesSequence[0] > ScheduledProtocolCodeSequence[0] > ProtocolContextSequence[0] >TextValue',
    )
    expect(pathCell).toHaveStyle({ paddingLeft: '42px' })
    expect(within(row).getByLabelText('Nested, depth 3')).toBeInTheDocument()
    expect(within(row).getByText('PHARMACOLOGIC STRESS AGENT A')).toBeInTheDocument()
    expect(within(row).getByText('PHARMACOLOGIC STRESS AGENT B')).toBeInTheDocument()
  })

  it('shows the encoding warning in the banner (13: charset mislabeled)', async () => {
    vi.mocked(window.inspector.compare).mockResolvedValue({ ok: true, result: scenarioResult('13_charset_mislabeled') })
    await renderScenarioInApp()

    const banner = screen.getByRole('status', { name: 'Engine warnings' })
    expect(banner).toHaveTextContent('1 warning while reading the files')
    expect(banner).toHaveTextContent('File B')
    expect(banner).toHaveTextContent('(0010,0010)')
    expect(banner).toHaveTextContent("Could not decode (0010,0010) using UTF8")
    expect(screen.getAllByTestId('diff-row')).toHaveLength(2)
  })

  it('shows a clear empty state for the identical pair with "Differences only" on (20)', async () => {
    vi.mocked(window.inspector.compare).mockResolvedValue({ ok: true, result: scenarioResult('20_identical') })
    await renderScenarioInApp()

    expect(screen.getByRole('checkbox', { name: 'Differences only' })).toBeChecked()
    expect(screen.queryAllByTestId('diff-row')).toHaveLength(0)
    const total = scenarioResult('20_identical').summary.total
    expect(screen.getByTestId('diff-table-empty')).toHaveTextContent(`No differences. All ${total} elements are identical.`)
    expect(screen.getByTestId('priority-mismatches')).toHaveTextContent(/^0\s*priority mismatches$/)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Differences only' }))
    expect(screen.getAllByTestId('diff-row').length).toBeGreaterThan(0)
  })
})
