import { CircleCheck, Download, LoaderCircle } from 'lucide-react'

import type { ExportFormat } from '../../../shared/api'
import { basename } from '../lib/format'
import { Kbd } from './Kbd'

export type ExportState = { phase: 'idle' } | { phase: 'saving' } | { phase: 'saved'; path: string }

interface ExportControlsProps {
  enabled: boolean
  format: ExportFormat
  state: ExportState
  onFormatChange(format: ExportFormat): void
  onExport(): void
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'html', label: 'HTML' },
  { value: 'pdf', label: 'PDF' },
]

export function ExportControls({ enabled, format, state, onFormatChange, onExport }: ExportControlsProps): React.JSX.Element {
  const saving = state.phase === 'saving'
  return (
    <div className="ml-auto flex items-center gap-2">
      {state.phase === 'saved' && (
        <span className="flex max-w-80 items-center gap-1 text-xs text-ok" title={state.path} role="status">
          <CircleCheck className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Saved {basename(state.path)}</span>
        </span>
      )}
      <div role="radiogroup" aria-label="Report format" className="flex overflow-hidden rounded-md border border-line">
        {FORMATS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={format === option.value}
            disabled={!enabled || saving}
            onClick={() => onFormatChange(option.value)}
            className={`px-2 py-1 text-xs font-medium disabled:opacity-40 ${
              format === option.value ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onExport}
        disabled={!enabled || saving}
        className="flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-xs font-semibold hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
        Export report
        <Kbd keys="Mod+E" />
      </button>
    </div>
  )
}
