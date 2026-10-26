import { describe, expect, it } from 'vitest'

import { STATUSES } from '../../../shared/schema'
import { at, sampleResult } from '../../../test/builders'
import { DEFAULT_FILTERS, filterRows, groupRows, matchesSearch, pathDepth, splitKeywordPath, type Filters } from './filters'

const rows = sampleResult().rows
const paths = (filters: Partial<Filters>): string[] => filterRows(rows, { ...DEFAULT_FILTERS, ...filters }).map((r) => r.path)

describe('filterRows', () => {
  it('shows only differences by default', () => {
    expect(DEFAULT_FILTERS.differencesOnly).toBe(true)
    expect(paths({})).toEqual(['(0008,0050)', '(0008,1030)', '(0008,1115)[0].(0008,1155)', '(0009,0010)', '(0010,1000)'])
  })

  it('shows every row with differences-only off', () => {
    expect(paths({ differencesOnly: false })).toHaveLength(rows.length)
  })

  it('filters by the selected statuses', () => {
    expect(paths({ statuses: ['only_in_a', 'only_in_b'] })).toEqual(['(0009,0010)', '(0010,1000)'])
    expect(paths({ differencesOnly: false, statuses: ['identical'] })).toEqual(['(0002,0010)', '(0008,0008)'])
    expect(paths({ statuses: [] })).toEqual([])
  })

  it('differences-only wins over a selected identical status', () => {
    expect(paths({ statuses: ['identical'] })).toEqual([])
  })

  it('filters to priority rows', () => {
    expect(paths({ priorityOnly: true })).toEqual(['(0008,0050)', '(0009,0010)'])
    expect(paths({ priorityOnly: true, differencesOnly: false })).toEqual(['(0002,0010)', '(0008,0050)', '(0009,0010)'])
  })

  it('combines all filters', () => {
    expect(paths({ priorityOnly: true, statuses: ['different'], search: 'acc' })).toEqual(['(0008,0050)'])
  })
})

describe('search', () => {
  it('matches keyword, keyword path and tag, case-insensitively', () => {
    expect(paths({ search: 'accessionnumber' })).toEqual(['(0008,0050)'])
    expect(paths({ search: 'ReferencedSeriesSequence' })).toEqual(['(0008,1115)[0].(0008,1155)'])
    expect(paths({ search: '(0010,1000)' })).toEqual(['(0010,1000)'])
  })

  it('matches a tag typed without punctuation', () => {
    expect(paths({ search: '00101000' })).toEqual(['(0010,1000)'])
    expect(paths({ search: '0010,1000' })).toEqual(['(0010,1000)'])
  })

  it('matches values on either side, including multi-valued ones', () => {
    expect(paths({ search: '2.25.3002' })).toEqual(['(0008,1115)[0].(0008,1155)'])
    expect(paths({ search: 'old-id' })).toEqual(['(0010,1000)'])
    expect(paths({ differencesOnly: false, search: 'original\\primary' })).toEqual(['(0008,0008)'])
  })

  it('matches the private creator', () => {
    expect(paths({ search: 'synthetic_vendor' })).toEqual(['(0009,0010)'])
  })

  it('treats blank search as no filter', () => {
    expect(matchesSearch(at(rows, 0), '   ')).toBe(true)
    expect(paths({ search: 'nothing-matches-this' })).toEqual([])
  })
})

describe('grouping and paths', () => {
  it('pins priority rows above the rest, keeping engine order in each group', () => {
    const { priority, other } = groupRows(rows)
    expect(priority.map((r) => r.path)).toEqual(['(0002,0010)', '(0008,0050)', '(0009,0010)'])
    expect(other.map((r) => r.path)).toEqual(['(0008,0008)', '(0008,1030)', '(0008,1115)[0].(0008,1155)', '(0010,1000)'])
  })

  it('computes sequence depth from the path', () => {
    expect(pathDepth('(0010,0010)')).toBe(0)
    expect(pathDepth('(0008,1115)[0].(0020,000E)')).toBe(1)
    expect(pathDepth('(0008,1115)[0].(0008,114A)[0].(0008,1155)')).toBe(2)
  })

  it('splits a keyword path into ancestors and leaf', () => {
    expect(splitKeywordPath('PatientName')).toEqual({ ancestors: [], leaf: 'PatientName' })
    expect(splitKeywordPath('A[0].B[12].C')).toEqual({ ancestors: ['A[0]', 'B[12]'], leaf: 'C' })
  })

  it('exposes all four statuses by default', () => {
    expect(DEFAULT_FILTERS.statuses).toEqual(STATUSES)
  })
})
