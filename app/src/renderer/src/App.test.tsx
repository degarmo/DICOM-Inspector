import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CompareOutcome, ExportOutcome, InspectorApi, OpenFilesRequest, PickedFile } from '../../shared/api'
import { makeResult, sampleResult } from '../../test/builders'
import { App } from './App'

const sizes = [
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(2000),
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400),
]
afterAll(() => sizes.forEach((spy) => spy.mockRestore()))

const FILE_A: PickedFile = { path: '/data/a.dcm', name: 'a.dcm', size: 740 }
const FILE_B: PickedFile = { path: '/data/b.txt', name: 'b.txt', size: 37 }

let api: { [K in keyof InspectorApi]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  api = {
    pickFile: vi.fn().mockResolvedValueOnce(FILE_A).mockResolvedValueOnce(FILE_B),
    compare: vi.fn<() => Promise<CompareOutcome>>().mockResolvedValue({ ok: true, result: sampleResult() }),
    exportReport: vi.fn<() => Promise<ExportOutcome>>().mockResolvedValue({ ok: true, path: '/out/dicom-diff.html' }),
    pathForFile: vi.fn(() => '/dropped/c.dcm'),
    launchRequest: vi.fn<() => Promise<OpenFilesRequest | null>>().mockResolvedValue(null),
    onOpenFiles: vi.fn(() => () => undefined),
  }
  window.inspector = api as unknown as InspectorApi
})

async function loadBoth(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Choose File A' }))
  await userEvent.click(screen.getByRole('button', { name: 'Choose File B' }))
  await screen.findByText('b.txt')
}

describe('App', () => {
  it('enables Compare only when both files are set', async () => {
    render(<App />)
    const compare = screen.getByRole('button', { name: /Compare/ })
    expect(compare).toBeDisabled()
    expect(screen.getByRole('button', { name: /Export report/ })).toBeDisabled()
    await loadBoth()
    expect(compare).toBeEnabled()
  })

  it('compares and shows summary, file details, warnings and the table', async () => {
    const result = makeResult(sampleResult().rows, [
      { code: 'decode_error', message: 'Could not decode (0010,0010)', file: 'b', path: '(0010,0010)' },
    ])
    api.compare.mockResolvedValue({ ok: true, result })
    render(<App />)
    await loadBoth()
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))

    expect(api.compare).toHaveBeenCalledWith('/data/a.dcm', '/data/b.txt', { force: false })
    expect(await screen.findByTestId('priority-mismatches')).toHaveTextContent(/^2\s*priority mismatches$/)
    expect(screen.getByTestId('count-different')).toHaveTextContent('3')
    expect(screen.getAllByText('Secondary Capture Image Storage')).toHaveLength(2)
    expect(screen.getByText('5 of 7 rows')).toBeInTheDocument()

    const warnings = screen.getByRole('status', { name: 'Engine warnings' })
    expect(warnings).toHaveTextContent('Could not decode (0010,0010)')
    await userEvent.click(within(warnings).getByRole('button', { name: 'Dismiss warnings' }))
    expect(screen.queryByRole('status', { name: 'Engine warnings' })).toBeNull()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Differences only' }))
    expect(screen.getByText('7 of 7 rows')).toBeInTheDocument()
  })

  it('passes Force read through to the engine', async () => {
    render(<App />)
    await loadBoth()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Force read (non-standard files)' }))
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(api.compare).toHaveBeenCalledWith('/data/a.dcm', '/data/b.txt', { force: true })
  })

  it('swaps A and B', async () => {
    render(<App />)
    await loadBoth()
    await userEvent.click(screen.getByRole('button', { name: 'Swap A and B' }))
    expect(screen.getByRole('button', { name: /^File A: b\.txt/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^File B: a\.dcm/ })).toBeInTheDocument()
  })

  it('shows an engine error inline, naming the file', async () => {
    api.compare.mockResolvedValue({
      ok: false,
      error: { code: 'not_dicom', message: "File is missing the DICOM preamble and 'DICM' prefix.", file: '/data/b.txt' },
    })
    render(<App />)
    await loadBoth()
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Not a DICOM file: File B (b.txt)')
    expect(alert).toHaveTextContent('enable "Force read"')
    expect(screen.queryByTestId('priority-mismatches')).toBeNull()
  })

  it('shows a timeout as an inline error', async () => {
    api.compare.mockResolvedValue({
      ok: false,
      error: { code: 'timeout', message: 'The engine did not finish within 30 seconds and was stopped.' },
    })
    render(<App />)
    await loadBoth()
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Engine timed out')
  })

  it('exports the current result with Ctrl+E in the chosen format', async () => {
    render(<App />)
    await loadBoth()
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))
    await screen.findByTestId('priority-mismatches')

    await userEvent.click(screen.getByRole('radio', { name: 'PDF' }))
    await userEvent.keyboard('{Control>}e{/Control}')
    expect(api.exportReport).toHaveBeenCalledWith(sampleResult(), 'pdf')
    expect(await screen.findByText('Saved dicom-diff.html')).toBeInTheDocument()
  })

  it('opens the file pickers with Ctrl+O and Ctrl+Shift+O', async () => {
    render(<App />)
    await userEvent.keyboard('{Control>}o{/Control}')
    await userEvent.keyboard('{Control>}{Shift>}o{/Shift}{/Control}')
    expect(api.pickFile).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('b.txt')).toBeInTheDocument()
    expect(screen.getByText('a.dcm')).toBeInTheDocument()
  })

  it('accepts a dropped file', async () => {
    render(<App />)
    const file = new File(['x'], 'c.dcm')
    const zone = screen.getByTestId('dropzone-File A')
    const dataTransfer = { files: [file], dropEffect: 'none' }
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.drop(zone, { dataTransfer })
    expect(api.pathForFile).toHaveBeenCalledWith(file)
    expect(await screen.findByText('c.dcm')).toBeInTheDocument()
  })
})


describe('App opened with files on the command line', () => {
  const pair: OpenFilesRequest['files'] = {
    a: { path: '/Scans/Study One/A.dcm', name: 'A.dcm', size: 740 },
    b: { path: '/Scans/Pr\u00fcfung/B.dcm', name: 'B.dcm', size: 836 },
  }

  it('loads both files and compares on open with --compare', async () => {
    api.launchRequest.mockResolvedValue({ files: pair, compare: true, errors: [] })
    render(<App />)
    expect(await screen.findByTestId('priority-mismatches')).toBeInTheDocument()
    expect(api.compare).toHaveBeenCalledWith('/Scans/Study One/A.dcm', '/Scans/Pr\u00fcfung/B.dcm', { force: false })
    expect(screen.getByRole('button', { name: /^File A: A\.dcm/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^File B: B\.dcm/ })).toBeInTheDocument()
  })

  it('loads without comparing when --compare is absent', async () => {
    api.launchRequest.mockResolvedValue({ files: pair, compare: false, errors: [] })
    render(<App />)
    expect(await screen.findByRole('button', { name: /^File B: B\.dcm/ })).toBeInTheDocument()
    expect(api.compare).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Compare/ })).toBeEnabled()
  })

  it('shows the normal load-panel error for a missing file', async () => {
    api.launchRequest.mockResolvedValue({
      files: { a: pair.a, b: null },
      compare: false,
      errors: [{ code: 'file_not_found', message: 'File not found: /Scans/missing.dcm', file: '/Scans/missing.dcm' }],
    })
    render(<App />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('File not found: missing.dcm')
    expect(alert).toHaveTextContent('File not found: /Scans/missing.dcm')
    expect(screen.getByRole('button', { name: /^File A: A\.dcm/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose File B' })).toBeInTheDocument()
    expect(api.compare).not.toHaveBeenCalled()
  })

  it('loads a pair handed over by a second launch into the open window', async () => {
    let push: ((request: OpenFilesRequest) => void) | undefined
    api.onOpenFiles.mockImplementation((listener: (request: OpenFilesRequest) => void) => {
      push = listener
      return () => undefined
    })
    render(<App />)
    await loadBoth()
    expect(push).toBeDefined()
    act(() => push?.({ files: pair, compare: true, errors: [] }))
    expect(await screen.findByTestId('priority-mismatches')).toBeInTheDocument()
    expect(api.compare).toHaveBeenLastCalledWith('/Scans/Study One/A.dcm', '/Scans/Pr\u00fcfung/B.dcm', { force: false })
  })
})
