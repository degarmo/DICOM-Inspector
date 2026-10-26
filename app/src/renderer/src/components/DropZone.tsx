import { FileUp, X } from 'lucide-react'
import { useState } from 'react'

import type { PickedFile } from '../../../shared/api'
import type { FileInfo } from '../../../shared/schema'
import { formatBytes } from '../lib/format'
import { Kbd } from './Kbd'

interface DropZoneProps {
  label: string
  shortcut: string
  file: PickedFile | null
  /** Engine-reported details, available after a successful compare. */
  info: FileInfo | null
  disabled: boolean
  onBrowse(): void
  onDropFile(file: File): void
  onClear(): void
}

export function DropZone({
  label,
  shortcut,
  file,
  info,
  disabled,
  onBrowse,
  onDropFile,
  onClear,
}: DropZoneProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={`relative flex min-w-0 flex-1 rounded-md border border-dashed transition-colors ${
        dragging
          ? 'border-accent bg-accent-soft'
          : file
            ? 'border-line-strong bg-panel'
            : 'border-line-strong bg-sunken hover:border-accent'
      }`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const dropped = event.dataTransfer.files[0]
        if (dropped && !disabled) onDropFile(dropped)
      }}
      data-testid={`dropzone-${label}`}
    >
      <button
        type="button"
        onClick={onBrowse}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left disabled:cursor-not-allowed"
        aria-label={file ? `${label}: ${file.name}. Click to choose a different file.` : `Choose ${label}`}
      >
        <FileUp className="size-5 shrink-0 text-muted" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {label}
            <Kbd keys={shortcut} />
          </span>
          {file ? (
            <>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-mono text-[13px] font-medium" title={file.path}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>
              </span>
              <span className="flex min-w-0 gap-3 text-xs text-muted">
                {info ? (
                  <>
                    <span className="truncate" title={info.sop_class?.uid ?? undefined}>
                      {info.sop_class?.name ?? 'No SOP Class'}
                    </span>
                    <span className="truncate" title={info.transfer_syntax?.uid ?? undefined}>
                      {info.transfer_syntax?.name ?? 'No Transfer Syntax (no file meta)'}
                    </span>
                  </>
                ) : (
                  <span className="text-faint">SOP Class and Transfer Syntax appear after compare</span>
                )}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-muted">Drop a file here or click to browse</span>
          )}
        </span>
      </button>
      {file && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="m-1 self-start rounded p-1 text-faint hover:bg-hover hover:text-fg"
          aria-label={`Clear ${label}`}
          title={`Clear ${label}`}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
