import { Flag, ShieldCheck } from 'lucide-react'

import type { Status, Summary } from '../../../shared/schema'
import { STATUS_META } from '../lib/status'

const ORDER: Status[] = ['identical', 'different', 'only_in_a', 'only_in_b']

export function SummaryBar({ summary }: { summary: Summary }): React.JSX.Element {
  const mismatches = summary.priority_mismatches
  return (
    <section aria-label="Summary" className="flex items-center gap-4 border-b border-line bg-panel px-3 py-2">
      <div
        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${
          mismatches > 0 ? 'border-danger/40 bg-danger-soft text-danger' : 'border-ok/30 bg-ok-soft text-ok'
        }`}
        data-testid="priority-mismatches"
      >
        {mismatches > 0 ? <Flag className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
        <span className="text-lg leading-none font-bold tabular-nums">{mismatches}</span>
        <span className="text-xs font-semibold">
          {mismatches === 1 ? 'priority mismatch' : 'priority mismatches'}
        </span>
      </div>
      <dl className="flex items-center gap-4">
        {ORDER.map((status) => {
          const meta = STATUS_META[status]
          const Icon = meta.icon
          return (
            <div key={status} className="flex items-center gap-1.5">
              <Icon className={`size-3.5 ${meta.text}`} aria-hidden />
              <dt className="text-xs text-muted">{meta.label}</dt>
              <dd className="font-mono text-[13px] font-semibold tabular-nums" data-testid={`count-${status}`}>
                {summary[status]}
              </dd>
            </div>
          )
        })}
        <div className="flex items-center gap-1.5 border-l border-line pl-4">
          <dt className="text-xs text-muted">Total</dt>
          <dd className="font-mono text-[13px] font-semibold tabular-nums">{summary.total}</dd>
        </div>
      </dl>
    </section>
  )
}
