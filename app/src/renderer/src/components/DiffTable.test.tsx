import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { at, makeRow, sampleResult } from '../../../test/builders'
import { DiffTable } from './DiffTable'

// jsdom has no layout; give the virtualized scroll container a real size.
const sizes = [
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(2000),
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400),
]
afterAll(() => sizes.forEach((spy) => spy.mockRestore()))

const rows = sampleResult().rows

function renderedPaths(): string[] {
  return screen.getAllByTestId('diff-row').map((row) => row.getAttribute('data-path') ?? '')
}

describe('DiffTable', () => {
  it('pins priority rows in a Priority group at the top', () => {
    render(<DiffTable rows={rows} selectedPath={null} onSelect={() => undefined} />)

    expect(renderedPaths()).toEqual([
      '(0002,0010)',
      '(0008,0050)',
      '(0009,0010)',
      '(0008,0008)',
      '(0008,1030)',
      '(0008,1115)[0].(0008,1155)',
      '(0010,1000)',
    ])
    const priorityGroup = screen.getByTestId('group-priority')
    expect(priorityGroup).toHaveTextContent('Priority')
    expect(priorityGroup).toHaveTextContent('3')
    expect(screen.getByTestId('group-other')).toHaveTextContent('Other rows')

    const priorityRows = screen.getAllByTestId('diff-row').slice(0, 3)
    for (const row of priorityRows) expect(within(row).getByRole('img', { name: 'Priority' })).toBeInTheDocument()
    expect(within(at(screen.getAllByTestId('diff-row'), 3)).queryByRole('img', { name: 'Priority' })).toBeNull()
  })

  it('renders a text label with every status', () => {
    render(<DiffTable rows={rows} selectedPath={null} onSelect={() => undefined} />)
    const statusOf = (path: string): string =>
      screen.getAllByTestId('diff-row').find((r) => r.getAttribute('data-path') === path)?.lastElementChild?.textContent ?? ''

    expect(statusOf('(0002,0010)')).toBe('Identical')
    expect(statusOf('(0008,0050)')).toBe('Different')
    expect(statusOf('(0010,1000)')).toBe('Only in A')
    expect(statusOf('(0009,0010)')).toBe('Only in B')
  })

  it('shows the private creator, VR mismatches, nesting and absent values', () => {
    render(<DiffTable rows={rows} selectedPath={null} onSelect={() => undefined} />)
    expect(screen.getByTestId('private-creator')).toHaveTextContent('SYNTHETIC_VENDOR_1')
    expect(screen.getByLabelText('VR mismatch')).toBeInTheDocument()
    expect(screen.getByText('LO/SH', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText('Nested, depth 1')).toBeInTheDocument()
    expect(screen.getAllByText('not present')).toHaveLength(2)
    expect(screen.getByText('empty')).toBeInTheDocument()
  })

  it('puts the full value in a tooltip', () => {
    const long = 'X'.repeat(300)
    render(
      <DiffTable
        rows={[makeRow({ path: '(0020,4000)', value_a: long, value_b: long })]}
        selectedPath={null}
        onSelect={() => undefined}
      />,
    )
    expect(screen.getAllByTitle(long)).toHaveLength(2)
  })

  it('omits group headers when there are no priority rows', () => {
    render(<DiffTable rows={rows.filter((r) => !r.is_priority)} selectedPath={null} onSelect={() => undefined} />)
    expect(screen.queryByTestId('group-priority')).toBeNull()
    expect(screen.queryByTestId('group-other')).toBeNull()
  })

  it('selects a row by click or keyboard', async () => {
    const onSelect = vi.fn()
    render(<DiffTable rows={rows} selectedPath="(0008,0050)" onSelect={onSelect} />)
    const rendered = screen.getAllByTestId('diff-row')
    const second = at(rendered, 1)
    expect(second).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(at(rendered, 0))
    expect(onSelect).toHaveBeenLastCalledWith('(0002,0010)')
    second.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('(0008,0050)')
  })

  it('says when no rows match', () => {
    render(<DiffTable rows={[]} selectedPath={null} onSelect={() => undefined} />)
    expect(screen.getByText('No rows match the current filters.')).toBeInTheDocument()
  })
})
