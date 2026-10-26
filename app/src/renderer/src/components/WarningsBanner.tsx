import { TriangleAlert, X } from 'lucide-react'

import type { ReportWarning } from '../../../shared/schema'

export function WarningsBanner({
  warnings,
  onDismiss,
}: {
  warnings: readonly ReportWarning[]
  onDismiss(): void
}): React.JSX.Element {
  return (
    <section
      role="status"
      aria-label="Engine warnings"
      className="flex items-start gap-3 border-b border-warn/30 bg-warn-soft px-4 py-2 text-[13px]"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-warn">
          {warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`} while reading the files
        </p>
        <ul className="mt-1 max-h-28 space-y-0.5 overflow-auto">
          {warnings.map((warning, index) => (
            <li key={index} className="flex gap-2">
              {warning.file && (
                <span className="shrink-0 font-semibold">File {warning.file.toUpperCase()}</span>
              )}
              {warning.path && <span className="shrink-0 font-mono text-muted">{warning.path}</span>}
              <span className="min-w-0 break-words">{warning.message}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
        aria-label="Dismiss warnings"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  )
}
