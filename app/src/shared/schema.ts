/**
 * Types mirroring the engine's JSON output (engine/dicom_inspector/schema.py).
 * The engine is the source of truth; keep these in lockstep with SCHEMA_VERSION.
 */

export const SCHEMA_VERSION = '1.0'

export const STATUSES = ['identical', 'different', 'only_in_a', 'only_in_b'] as const
export type Status = (typeof STATUSES)[number]

export type FileLabel = 'a' | 'b'

/** A rendered element value: a string, or a list of strings for multi-valued elements. */
export type Value = string | string[]

export interface UidInfo {
  uid: string
  name: string
}

export interface FileInfo {
  path: string
  size_bytes: number
  sha256: string
  transfer_syntax: UidInfo | null
  sop_class: UidInfo | null
}

export interface Summary {
  total: number
  identical: number
  different: number
  only_in_a: number
  only_in_b: number
  priority_mismatches: number
}

export interface ReportWarning {
  code: string
  message: string
  file: FileLabel | null
  path: string | null
}

export interface Row {
  path: string
  keyword_path: string
  tag: string
  keyword: string
  vr: string
  value_a: Value | null
  value_b: Value | null
  status: Status
  is_private: boolean
  private_creator: string | null
  is_priority: boolean
  vr_a: string | null
  vr_b: string | null
  vr_mismatch: boolean
}

export interface CompareResult {
  schema_version: typeof SCHEMA_VERSION
  files: Record<FileLabel, FileInfo>
  summary: Summary
  warnings: ReportWarning[]
  rows: Row[]
}

/** Engine error document written to stderr on a nonzero exit. */
export interface EngineErrorDocument {
  error: { code: string; message: string; file: string | null }
}
