import { useCallback, useRef, useState } from 'react'

import type { AppError, OpenFilesRequest, PickedFile } from '../../../shared/api'
import type { CompareResult, FileLabel } from '../../../shared/schema'

export type RunState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; result: CompareResult }
  | { phase: 'error'; error: AppError }

type Files = Record<FileLabel, PickedFile | null>

/** File selection, the force flag, and the engine run. Any input change invalidates the result. */
export function useComparison() {
  const [files, setFiles] = useState<Files>({ a: null, b: null })
  const [force, setForceState] = useState(false)
  const [run, setRun] = useState<RunState>({ phase: 'idle' })
  const generation = useRef(0)

  const invalidate = useCallback(() => {
    generation.current += 1
    setRun({ phase: 'idle' })
  }, [])

  const setFile = useCallback(
    (slot: FileLabel, file: PickedFile | null) => {
      setFiles((current) => ({ ...current, [slot]: file }))
      invalidate()
    },
    [invalidate],
  )

  const browse = useCallback(
    async (slot: FileLabel) => {
      try {
        const picked = await window.inspector.pickFile()
        if (picked) setFile(slot, picked)
      } catch (error) {
        setRun({ phase: 'error', error: ipcError(error) })
      }
    },
    [setFile],
  )

  const dropFile = useCallback(
    (slot: FileLabel, file: File) => {
      const path = window.inspector.pathForFile(file)
      if (!path) {
        setRun({
          phase: 'error',
          error: { code: 'unreadable', message: `Could not determine the location of "${file.name}" on disk.` },
        })
        return
      }
      setFile(slot, { path, name: file.name, size: file.size })
    },
    [setFile],
  )

  const swap = useCallback(() => {
    setFiles((current) => ({ a: current.b, b: current.a }))
    invalidate()
  }, [invalidate])

  const setForce = useCallback(
    (value: boolean) => {
      setForceState(value)
      invalidate()
    },
    [invalidate],
  )

  /** Load a pair given on the command line; the first problem shows as the load-panel error. */
  const openFiles = useCallback((request: OpenFilesRequest) => {
    generation.current += 1
    setFiles({ a: request.files.a, b: request.files.b })
    const problem = request.errors[0]
    setRun(problem ? { phase: 'error', error: problem } : { phase: 'idle' })
  }, [])

  /** Compare the current files, or `pair` when it was just loaded and state has not updated yet. */
  const compare = useCallback(async (pair?: Files): Promise<CompareResult | null> => {
    const { a, b } = pair ?? files
    if (!a || !b || run.phase === 'running') return null
    const mine = ++generation.current
    setRun({ phase: 'running' })
    let next: RunState
    try {
      const outcome = await window.inspector.compare(a.path, b.path, { force })
      next = outcome.ok ? { phase: 'done', result: outcome.result } : { phase: 'error', error: outcome.error }
    } catch (error) {
      next = { phase: 'error', error: ipcError(error) }
    }
    if (mine !== generation.current) return null
    setRun(next)
    return next.phase === 'done' ? next.result : null
  }, [files, force, run.phase])

  const dismissError = useCallback(() => {
    setRun((current) => (current.phase === 'error' ? { phase: 'idle' } : current))
  }, [])

  return { files, force, run, browse, dropFile, setFile, swap, setForce, compare, openFiles, dismissError }
}

function ipcError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error)
  return { code: 'internal_error', message: `The request to the main process failed: ${message}` }
}
