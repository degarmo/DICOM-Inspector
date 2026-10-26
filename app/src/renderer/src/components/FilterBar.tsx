import { Flag, Search, X } from 'lucide-react'

import { STATUSES, type Status } from '../../../shared/schema'
import type { Filters } from '../lib/filters'
import { STATUS_META } from '../lib/status'

interface FilterBarProps {
  filters: Filters
  shown: number
  total: number
  onChange(filters: Filters): void
}

export function FilterBar({ filters, shown, total, onChange }: FilterBarProps): React.JSX.Element {
  const toggleStatus = (status: Status): void => {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : STATUSES.filter((s) => s === status || filters.statuses.includes(s))
    onChange({ ...filters, statuses })
  }

  return (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-1.5">
      <label className="flex items-center gap-2 text-xs font-medium select-none">
        <input
          type="checkbox"
          checked={filters.differencesOnly}
          onChange={(event) => onChange({ ...filters, differencesOnly: event.target.checked })}
          className="size-3.5 accent-accent"
        />
        Differences only
      </label>

      <div role="group" aria-label="Status" className="flex items-center gap-1">
        {STATUSES.map((status) => {
          const meta = STATUS_META[status]
          const Icon = meta.icon
          const selected = filters.statuses.includes(status)
          const hiddenByDiffOnly = status === 'identical' && filters.differencesOnly
          return (
            <button
              key={status}
              type="button"
              aria-pressed={selected}
              disabled={hiddenByDiffOnly}
              title={hiddenByDiffOnly ? 'Turn off "Differences only" to show identical rows' : undefined}
              onClick={() => toggleStatus(status)}
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? `border-current/40 ${meta.text} ${meta.soft} font-medium` : 'border-line text-faint line-through'
              }`}
            >
              <Icon className="size-3.5" aria-hidden />
              {meta.label}
            </button>
          )
        })}
      </div>

      <label className="flex items-center gap-2 text-xs font-medium select-none">
        <input
          type="checkbox"
          checked={filters.priorityOnly}
          onChange={(event) => onChange({ ...filters, priorityOnly: event.target.checked })}
          className="size-3.5 accent-accent"
        />
        <Flag className="size-3.5 text-danger" aria-hidden />
        Priority only
      </label>

      <div className="relative ml-auto flex items-center">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-faint" aria-hidden />
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Search tag, keyword or value"
          aria-label="Search tag, keyword or value"
          className="h-7 w-72 rounded border border-line bg-sunken pr-7 pl-7 text-xs outline-none placeholder:text-faint focus:border-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: '' })}
            className="absolute right-1 rounded p-0.5 text-faint hover:text-fg"
            aria-label="Clear search"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <span className="text-xs text-muted tabular-nums" aria-live="polite">
        {shown} of {total} rows
      </span>
    </section>
  )
}
