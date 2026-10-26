import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CornerDownRight, Flag, TriangleAlert } from 'lucide-react'
import { useMemo, useRef } from 'react'

import type { Row } from '../../../shared/schema'
import { groupRows, pathDepth, splitKeywordPath } from '../lib/filters'
import { formatValue } from '../lib/format'
import { StatusBadge } from '../lib/status'

export const ROW_HEIGHT = 30
const GROUP_HEIGHT = 28
const GRID = 'grid grid-cols-[150px_minmax(260px,2.2fr)_72px_minmax(160px,1fr)_minmax(160px,1fr)_118px]'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Row>()

const columns = helper.columns([
  helper.accessor('tag', { header: 'Tag', cell: (info) => <TagCell row={info.row.original} /> }),
  helper.accessor('keyword_path', { header: 'Keyword path', cell: (info) => <KeywordPathCell row={info.row.original} /> }),
  helper.accessor('vr', { header: 'VR', cell: (info) => <VrCell row={info.row.original} /> }),
  helper.accessor('value_a', { header: 'Value A', cell: (info) => <ValueCell value={info.row.original.value_a} /> }),
  helper.accessor('value_b', { header: 'Value B', cell: (info) => <ValueCell value={info.row.original.value_b} /> }),
  helper.accessor('status', { header: 'Status', cell: (info) => <StatusBadge status={info.row.original.status} /> }),
])

type Item = { kind: 'group'; label: string; count: number; priority: boolean } | { kind: 'row'; index: number }

interface DiffTableProps {
  rows: readonly Row[]
  selectedPath: string | null
  onSelect(path: string): void
  /** Shown instead of rows when there are none to display. */
  emptyMessage?: string
}

export function DiffTable({
  rows,
  selectedPath,
  onSelect,
  emptyMessage = 'No rows match the current filters.',
}: DiffTableProps): React.JSX.Element {
  const ordered = useMemo(() => {
    const { priority, other } = groupRows(rows)
    return { data: [...priority, ...other], priorityCount: priority.length, otherCount: other.length }
  }, [rows])

  const table = useTable({ features, columns, data: ordered.data })
  const tableRows = table.getRowModel().rows

  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    const { priorityCount, otherCount } = ordered
    if (priorityCount > 0) list.push({ kind: 'group', label: 'Priority', count: priorityCount, priority: true })
    for (let i = 0; i < priorityCount; i++) list.push({ kind: 'row', index: i })
    if (priorityCount > 0 && otherCount > 0) {
      list.push({ kind: 'group', label: 'Other rows', count: otherCount, priority: false })
    }
    for (let i = priorityCount; i < priorityCount + otherCount; i++) list.push({ kind: 'row', index: i })
    return list
  }, [ordered])

  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer's return value is used only during render
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (items[index]?.kind === 'group' ? GROUP_HEIGHT : ROW_HEIGHT),
    overscan: 12,
  })

  return (
    <div role="table" aria-label="Header differences" aria-rowcount={rows.length + 1} className="flex min-h-0 flex-1 flex-col bg-panel">
      <div role="rowgroup" className="shrink-0 border-b border-line-strong bg-sunken">
        {table.getHeaderGroups().map((group) => (
          <div role="row" key={group.id} className={`${GRID} h-7 items-center`}>
            {group.headers.map((header) => (
              <div role="columnheader" key={header.id} className="truncate px-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
                <table.FlexRender header={header} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div ref={scrollRef} role="rowgroup" className="min-h-0 flex-1 overflow-auto" data-testid="diff-table-body">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted" data-testid="diff-table-empty">
            {emptyMessage}
          </p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => {
              const item = items[virtual.index]
              if (!item) return null
              const position = { height: virtual.size, transform: `translateY(${virtual.start}px)` }
              if (item.kind === 'group') {
                return (
                  <div
                    key={`group-${item.label}`}
                    role="row"
                    className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-line bg-sunken px-2 text-[11px] font-semibold tracking-wide uppercase"
                    style={position}
                    data-testid={`group-${item.priority ? 'priority' : 'other'}`}
                  >
                    <div role="cell" aria-colspan={6} className="flex items-center gap-2">
                      {item.priority && <Flag className="size-3.5 text-danger" aria-hidden />}
                      <span className={item.priority ? 'text-danger' : 'text-muted'}>{item.label}</span>
                      <span className="font-mono text-faint">{item.count}</span>
                    </div>
                  </div>
                )
              }
              const row = tableRows[item.index]
              if (!row) return null
              const selected = row.original.path === selectedPath
              return (
                <div
                  key={row.original.path}
                  role="row"
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => onSelect(row.original.path)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(row.original.path)
                    }
                  }}
                  className={`${GRID} absolute top-0 left-0 w-full cursor-default items-center border-b border-line/70 ${
                    selected ? 'bg-selected' : 'hover:bg-hover'
                  }`}
                  style={position}
                  data-testid="diff-row"
                  data-path={row.original.path}
                >
                  {row.getAllCells().map((cell) => (
                    <div role="cell" key={cell.id} className="flex min-w-0 items-center px-2">
                      <table.FlexRender cell={cell} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function TagCell({ row }: { row: Row }): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {row.is_priority ? (
        <Flag className="size-3.5 shrink-0 text-danger" role="img" aria-label="Priority" />
      ) : (
        <span className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="font-mono text-xs">{row.tag}</span>
    </span>
  )
}

function KeywordPathCell({ row }: { row: Row }): React.JSX.Element {
  const depth = pathDepth(row.path)
  const { ancestors, leaf } = splitKeywordPath(row.keyword_path)
  return (
    <span className="flex min-w-0 items-center gap-1" style={{ paddingLeft: depth * 14 }} title={row.keyword_path}>
      {depth > 0 && <CornerDownRight className="size-3 shrink-0 text-faint" aria-label={`Nested, depth ${depth}`} />}
      {ancestors.length > 0 && (
        <span className="min-w-0 shrink truncate font-mono text-[11px] text-faint">{ancestors.join(' > ')} &gt;</span>
      )}
      {row.is_private ? (
        <span className="flex min-w-0 shrink-0 items-center gap-1.5">
          <span className="rounded border border-line px-1 text-[10px] font-semibold text-muted uppercase">Private</span>
          <span className="truncate font-mono text-xs" data-testid="private-creator">
            {row.private_creator ?? 'no private creator'}
          </span>
        </span>
      ) : (
        <span className="shrink-0 truncate text-xs font-medium">{leaf}</span>
      )}
    </span>
  )
}

function VrCell({ row }: { row: Row }): React.JSX.Element {
  if (row.vr_mismatch) {
    return (
      <span className="flex items-center gap-1 font-mono text-xs font-semibold text-diff" title={`VR differs: ${row.vr_a} in A, ${row.vr_b} in B`}>
        <TriangleAlert className="size-3 shrink-0" aria-label="VR mismatch" />
        {row.vr_a}/{row.vr_b}
      </span>
    )
  }
  return <span className="font-mono text-xs text-muted">{row.vr}</span>
}

function ValueCell({ value }: { value: Row['value_a'] }): React.JSX.Element {
  if (value === null) return <span className="text-xs text-faint italic">not present</span>
  const text = formatValue(value)
  if (text === '') return <span className="text-xs text-faint italic">empty</span>
  return (
    <span className="truncate font-mono text-xs" title={text}>
      {text}
    </span>
  )
}
