import type { CompareResult } from './schema'

/** IPC channel names shared by main and preload. */
export const IPC = {
  pickFile: 'inspector:pick-file',
  compare: 'inspector:compare',
  exportReport: 'inspector:export-report',
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
}
