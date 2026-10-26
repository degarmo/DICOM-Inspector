import { Lock, ScanSearch } from 'lucide-react'

import { ErrorBanner } from './components/ErrorBanner'
import { LoadPanel } from './components/LoadPanel'
import { useComparison } from './hooks/useComparison'
import { useShortcuts } from './hooks/useShortcuts'

export function App(): React.JSX.Element {
  const comparison = useComparison()
  const { files, force, run } = comparison
  const result = run.phase === 'done' ? run.result : null

  useShortcuts({
    openA: () => void comparison.browse('a'),
    openB: () => void comparison.browse('b'),
    compare: () => void comparison.compare(),
    exportReport: () => undefined,
  })

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <ScanSearch className="size-4 text-accent" aria-hidden />
        <h1 className="text-[13px] font-semibold">DICOM Inspector</h1>
        <span className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
          <Lock className="size-3" aria-hidden />
          Local, read-only
        </span>
      </header>
      <LoadPanel
        files={files}
        result={result}
        force={force}
        running={run.phase === 'running'}
        onBrowse={(slot) => void comparison.browse(slot)}
        onDropFile={comparison.dropFile}
        onClear={(slot) => comparison.setFile(slot, null)}
        onSwap={comparison.swap}
        onForceChange={comparison.setForce}
        onCompare={() => void comparison.compare()}
      />
      {run.phase === 'error' && (
        <ErrorBanner error={run.error} files={files} force={force} onDismiss={comparison.dismissError} />
      )}
      {result && (
        <p className="px-4 py-2 text-muted">
          {result.summary.total} rows compared, {result.summary.total - result.summary.identical} not identical.
        </p>
      )}
    </div>
  )
}
