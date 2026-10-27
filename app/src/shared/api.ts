import type { CompareResult } from './schema'

/** IPC channel names shared by main and preload. */
export const IPC = {
  pickFile: 'inspector:pick-file',
  compare: 'inspector:compare',
  exportReport: 'inspector:export-report',
  launchRequest: 'inspector:launch-request',
  openFiles: 'inspector:open-files',
} as const

export interface PickedFile {
  path: string
  name: string
  size: number
}

export interface CompareOptions {
  /** Maps to the engine's --force flag. */
  force: boolean
}

/**
 * Error codes: the engine's own (file_not_found, not_a_file, unreadable,
 * not_dicom, invalid_dicom, usage_error, internal_error) plus those raised by
 * the runner itself.
 */
export type RunnerErrorCode =
  | 'timeout'
  | 'engine_not_found'
  | 'engine_failed'
  | 'invalid_output'
  | 'schema_mismatch'

export interface AppError {
  code: string
  message: string
  /** Path of the file the error concerns, when the engine names one. */
  file?: string
}

export type CompareOutcome = { ok: true; result: CompareResult } | { ok: false; error: AppError }

/** Files named on the command line, already checked by the main process. */
export interface OpenFilesRequest {
  files: { a: PickedFile | null; b: PickedFile | null }
  /** Run the comparison right away (--compare, and both files are valid). */
  compare: boolean
  /** One error per path that could not be loaded. */
  errors: AppError[]
}

export type ExportFormat = 'html' | 'pdf'

export type ExportOutcome =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: AppError }

/** The only surface the renderer has onto the main process (window.inspector). */
export interface InspectorApi {
  pickFile(): Promise<PickedFile | null>
  compare(a: string, b: string, opts: CompareOptions): Promise<CompareOutcome>
  exportReport(result: CompareResult, format: ExportFormat): Promise<ExportOutcome>
  /** Absolute path of a dragged-and-dropped File. Local to the preload; no IPC. */
  pathForFile(file: File): string
  /** Files given on the command line when the app started, if any. */
  launchRequest(): Promise<OpenFilesRequest | null>
  /** Files handed over by a second launch while the app is open. Returns an unsubscribe function. */
  onOpenFiles(listener: (request: OpenFilesRequest) => void): () => void
}
