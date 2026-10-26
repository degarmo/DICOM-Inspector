import { Lock, ScanSearch } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DiffTable } from './components/DiffTable'
import { ErrorBanner } from './components/ErrorBanner'
import { FilterBar } from './components/FilterBar'
import { Kbd } from './components/Kbd'
import { LoadPanel } from './components/LoadPanel'
import { RowDetails } from './components/RowDetails'
import { SummaryBar } from './components/SummaryBar'
import { WarningsBanner } from './components/WarningsBanner'
import { useComparison } from './hooks/useComparison'
import { useShortcuts } from './hooks/useShortcuts'
import { DEFAULT_FILTERS, filterRows, type Filters } from './lib/filters'

export function App(): React.JSX.Element {
  const comparison = useComparison()
  const { files, force, run } = comparison
  const result = run.phase === 'done' ? run.result : null

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [warningsDismissed, setWarningsDismissed] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Each new result starts with "Differences only" on, warnings visible and nothing selected.
  const runCompare = async (): Promise<void> => {
    const fresh = await comparison.compare()
    if (!fresh) return
    setFilters((current) => ({ ...current, differencesOnly: true }))
    setWarningsDismissed(false)
    setSelectedPath(null)
  }

  const visibleRows = useMemo(() => (result ? filterRows(result.rows, filters) : []), [result, filters])
  const selectedRow = result?.rows.find((row) => row.path === selectedPath) ?? null

  useShortcuts({
    openA: () => void comparison.browse('a'),
    openB: () => void comparison.browse('b'),
    compare: () => void runCompare(),
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
        onCompare={() => void runCompare()}
      />
      {run.phase === 'error' && (
        <ErrorBanner error={run.error} files={files} force={force} onDismiss={comparison.dismissError} />
      )}
      {result && result.warnings.length > 0 && !warningsDismissed && (
        <WarningsBanner warnings={result.warnings} onDismiss={() => setWarningsDismissed(true)} />
      )}
      {result ? (
        <>
          <SummaryBar summary={result.summary} />
          <FilterBar filters={filters} shown={visibleRows.length} total={result.rows.length} onChange={setFilters} />
          <DiffTable rows={visibleRows} selectedPath={selectedPath} onSelect={setSelectedPath} />
          {selectedRow && <RowDetails row={selectedRow} onClose={() => setSelectedPath(null)} />}
        </>
      ) : (
        <EmptyState running={run.phase === 'running'} />
      )}
    </div>
  )
}

function EmptyState({ running }: { running: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
      {running ? (
        <p>Running the comparison engine...</p>
      ) : (
        <>
          <p>Choose File A and File B, then compare.</p>
          <p className="flex items-center gap-2 text-xs text-faint">
            Open A <Kbd keys="Mod+O" /> Open B <Kbd keys="Mod+Shift+O" /> Compare <Kbd keys="Mod+Enter" />
          </p>
        </>
      )}
    </div>
  )
}
