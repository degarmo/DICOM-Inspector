import { ArrowLeftRight, GitCompareArrows, LoaderCircle } from 'lucide-react'

import type { PickedFile } from '../../../shared/api'
import type { CompareResult, FileLabel } from '../../../shared/schema'
import { DropZone } from './DropZone'
import { Kbd } from './Kbd'

interface LoadPanelProps {
  files: Record<FileLabel, PickedFile | null>
  result: CompareResult | null
  force: boolean
  running: boolean
  onBrowse(slot: FileLabel): void
  onDropFile(slot: FileLabel, file: File): void
  onClear(slot: FileLabel): void
  onSwap(): void
  onForceChange(force: boolean): void
  onCompare(): void
}

export function LoadPanel(props: LoadPanelProps): React.JSX.Element {
  const { files, result, force, running } = props
  const canCompare = Boolean(files.a && files.b) && !running

  return (
    <section aria-label="Files to compare" className="flex items-stretch gap-2 border-b border-line bg-panel px-3 py-2">
      <DropZone
        label="File A"
        shortcut="Mod+O"
        file={files.a}
        info={result?.files.a ?? null}
        disabled={running}
        onBrowse={() => props.onBrowse('a')}
        onDropFile={(file) => props.onDropFile('a', file)}
        onClear={() => props.onClear('a')}
      />
      <button
        type="button"
        onClick={props.onSwap}
        disabled={running || (!files.a && !files.b)}
        className="self-center rounded-md border border-line p-2 text-muted hover:bg-hover hover:text-fg disabled:opacity-40"
        aria-label="Swap A and B"
        title="Swap A and B"
      >
        <ArrowLeftRight className="size-4" aria-hidden />
      </button>
      <DropZone
        label="File B"
        shortcut="Mod+Shift+O"
        file={files.b}
        info={result?.files.b ?? null}
        disabled={running}
        onBrowse={() => props.onBrowse('b')}
        onDropFile={(file) => props.onDropFile('b', file)}
        onClear={() => props.onClear('b')}
      />
      <div className="flex w-56 shrink-0 flex-col justify-center gap-2 pl-1">
        <label className="flex items-center gap-2 text-xs text-muted select-none">
          <input
            type="checkbox"
            checked={force}
            disabled={running}
            onChange={(event) => props.onForceChange(event.target.checked)}
            className="size-3.5 accent-accent"
          />
          Force read (non-standard files)
        </label>
        <button
          type="button"
          onClick={props.onCompare}
          disabled={!canCompare}
          className="flex h-8 items-center justify-center gap-2 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Comparing...
            </>
          ) : (
            <>
              <GitCompareArrows className="size-4" aria-hidden />
              Compare
              <Kbd keys="Mod+Enter" />
            </>
          )}
        </button>
      </div>
    </section>
  )
}
