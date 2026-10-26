import { CircleX, X } from 'lucide-react'

import type { AppError, PickedFile } from '../../../shared/api'
import type { FileLabel } from '../../../shared/schema'
import { basename } from '../lib/format'

const TITLES: Record<string, string> = {
  file_not_found: 'File not found',
  not_a_file: 'Not a file',
  unreadable: 'File could not be read',
  not_dicom: 'Not a DICOM file',
  invalid_dicom: 'Invalid DICOM file',
  timeout: 'Engine timed out',
  engine_not_found: 'Comparison engine not available',
  invalid_output: 'Unexpected engine output',
  schema_mismatch: 'Engine version mismatch',
  export_failed: 'Export failed',
}

interface ErrorBannerProps {
  error: AppError
  files: Record<FileLabel, PickedFile | null>
  force: boolean
  onDismiss(): void
}

/** Which slot an engine error refers to, e.g. "File B (scan.dcm)". */
export function describeErrorFile(path: string, files: Record<FileLabel, PickedFile | null>): string {
  const name = basename(path)
  if (files.a?.path === path) return `File A (${name})`
  if (files.b?.path === path) return `File B (${name})`
  return name
}

export function ErrorBanner({ error, files, force, onDismiss }: ErrorBannerProps): React.JSX.Element {
  const title = TITLES[error.code] ?? 'Comparison failed'
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-danger/30 bg-danger-soft px-4 py-2.5 text-[13px]"
    >
      <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-danger">
          {title}
          {error.file && <span className="font-normal text-fg">: {describeErrorFile(error.file, files)}</span>}
        </p>
        <p className="mt-0.5 break-words whitespace-pre-wrap text-fg">{error.message}</p>
        {error.code === 'not_dicom' && !force && (
          <p className="mt-1 text-muted">
            If this is a raw DICOM dataset without a preamble, enable "Force read" and compare again.
          </p>
        )}
        <p className="mt-1 font-mono text-[11px] text-faint">code: {error.code}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
        aria-label="Dismiss error"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
