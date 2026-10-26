import { STATUSES, type Row, type Status } from '../../../shared/schema'
import { formatValue } from './format'

export interface Filters {
  /** Hide identical rows. On by default after every compare. */
  differencesOnly: boolean
  /** Statuses to show. */
  statuses: readonly Status[]
  priorityOnly: boolean
  /** Case-insensitive text matched against tag, keyword, path, values and private creator. */
  search: string
}

export const DEFAULT_FILTERS: Filters = {
  differencesOnly: true,
  statuses: STATUSES,
  priorityOnly: false,
  search: '',
}

const TAG_PUNCTUATION = /[(),\s]/g

export function matchesSearch(row: Row, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  const haystack = [
    row.tag,
    row.keyword,
    row.keyword_path,
    row.path,
    formatValue(row.value_a),
    formatValue(row.value_b),
    row.private_creator ?? '',
  ]
    .join('\n')
    .toLowerCase()
  if (haystack.includes(query)) return true
  // Let "0020000d" or "0020,000d" find "(0020,000D)".
  const compactQuery = query.replace(TAG_PUNCTUATION, '')
  return compactQuery.length > 0 && row.tag.replace(TAG_PUNCTUATION, '').toLowerCase().includes(compactQuery)
}

export function filterRows(rows: readonly Row[], filters: Filters): Row[] {
  return rows.filter(
    (row) =>
      !(filters.differencesOnly && row.status === 'identical') &&
      filters.statuses.includes(row.status) &&
      !(filters.priorityOnly && !row.is_priority) &&
      matchesSearch(row, filters.search),
  )
}

/** Priority rows are pinned in their own group above all others; engine order is kept within each. */
export function groupRows(rows: readonly Row[]): { priority: Row[]; other: Row[] } {
  const priority: Row[] = []
  const other: Row[] = []
  for (const row of rows) (row.is_priority ? priority : other).push(row)
  return { priority, other }
}

/** Sequence nesting depth from the path: "(0008,1115)[0].(0020,000E)" is depth 1. */
export function pathDepth(path: string): number {
  return (path.match(/\]\./g) ?? []).length
}

/** "A[0].B[1].C" -> { ancestors: ["A[0]", "B[1]"], leaf: "C" } */
export function splitKeywordPath(keywordPath: string): { ancestors: string[]; leaf: string } {
  const parts = keywordPath.split(/(?<=\])\./)
  const leaf = parts.pop() ?? keywordPath
  return { ancestors: parts, leaf }
}
