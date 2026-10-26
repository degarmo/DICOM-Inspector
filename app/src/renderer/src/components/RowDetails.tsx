import { Flag, X } from 'lucide-react'

import type { Row } from '../../../shared/schema'
import { formatValue } from '../lib/format'
import { StatusBadge } from '../lib/status'

export function RowDetails({ row, onClose }: { row: Row; onClose(): void }): React.JSX.Element {
  return (
    <section aria-label="Selected row" className="flex max-h-[40%] shrink-0 flex-col border-t border-line-strong bg-panel">
      <header className="flex items-center gap-3 border-b border-line px-3 py-1.5">
        {row.is_priority && <Flag className="size-3.5 text-danger" role="img" aria-label="Priority" />}
        <span className="font-mono text-xs font-semibold">{row.tag}</span>
        <span className="min-w-0 truncate text-xs">{row.keyword || (row.is_private ? 'Private tag' : 'Unknown tag')}</span>
        <StatusBadge status={row.status} />
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-muted hover:bg-hover hover:text-fg"
          aria-label="Close details"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="grid min-h-0 grid-cols-[auto_1fr] gap-x-4 gap-y-1 overflow-auto px-3 py-2 text-xs">
        <Field label="Path" mono>{row.path}</Field>
        <Field label="Keyword path" mono>{row.keyword_path}</Field>
        <Field label="VR" mono>
          {row.vr_mismatch ? `${row.vr_a} in A, ${row.vr_b} in B (mismatch)` : row.vr}
        </Field>
        {row.is_private && <Field label="Private creator" mono>{row.private_creator ?? 'none'}</Field>}
        <Field label="Value A" mono>{describeValue(row.value_a)}</Field>
        <Field label="Value B" mono>{describeValue(row.value_b)}</Field>
      </div>
    </section>
  )
}

function describeValue(value: Row['value_a']): string {
  if (value === null) return '(not present)'
  const text = formatValue(value)
  return text === '' ? '(empty)' : text
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className={`break-all whitespace-pre-wrap select-text ${mono ? 'font-mono' : ''}`}>{children}</span>
    </>
  )
}
