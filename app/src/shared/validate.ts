import {
  SCHEMA_VERSION,
  STATUSES,
  type CompareResult,
  type EngineErrorDocument,
  type FileInfo,
  type ReportWarning,
  type Row,
  type Summary,
  type UidInfo,
} from './schema'

/** Thrown when a value does not match the engine's JSON contract. */
export class SchemaError extends Error {
  constructor(
    message: string,
    readonly code: 'schema_mismatch' | 'invalid_output',
  ) {
    super(message)
    this.name = 'SchemaError'
  }
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(where: string, expected: string): never {
  throw new SchemaError(`Engine output is malformed: ${where} should be ${expected}.`, 'invalid_output')
}

function str(obj: Json, key: string, where: string): string {
  const value = obj[key]
  if (typeof value !== 'string') fail(`${where}.${key}`, 'a string')
  return value
}

function nullableStr(obj: Json, key: string, where: string): string | null {
  const value = obj[key]
  if (value !== null && typeof value !== 'string') fail(`${where}.${key}`, 'a string or null')
  return value
}

function int(obj: Json, key: string, where: string): number {
  const value = obj[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`${where}.${key}`, 'an integer')
  return value
}

function bool(obj: Json, key: string, where: string): boolean {
  const value = obj[key]
  if (typeof value !== 'boolean') fail(`${where}.${key}`, 'a boolean')
  return value
}

function uidInfo(value: unknown, where: string): UidInfo | null {
  if (value === null) return null
  if (!isObject(value)) fail(where, 'an object or null')
  return { uid: str(value, 'uid', where), name: str(value, 'name', where) }
}

function fileInfo(value: unknown, where: string): FileInfo {
  if (!isObject(value)) fail(where, 'an object')
  return {
    path: str(value, 'path', where),
    size_bytes: int(value, 'size_bytes', where),
    sha256: str(value, 'sha256', where),
    transfer_syntax: uidInfo(value['transfer_syntax'], `${where}.transfer_syntax`),
    sop_class: uidInfo(value['sop_class'], `${where}.sop_class`),
  }
}

function summary(value: unknown): Summary {
  const where = 'summary'
  if (!isObject(value)) fail(where, 'an object')
  return {
    total: int(value, 'total', where),
    identical: int(value, 'identical', where),
    different: int(value, 'different', where),
    only_in_a: int(value, 'only_in_a', where),
    only_in_b: int(value, 'only_in_b', where),
    priority_mismatches: int(value, 'priority_mismatches', where),
  }
}

function warning(value: unknown, where: string): ReportWarning {
  if (!isObject(value)) fail(where, 'an object')
  const file = value['file']
  if (file !== null && file !== 'a' && file !== 'b') fail(`${where}.file`, '"a", "b" or null')
  return {
    code: str(value, 'code', where),
    message: str(value, 'message', where),
    file,
    path: nullableStr(value, 'path', where),
  }
}

function rowValue(obj: Json, key: string, where: string): string | string[] | null {
  const value = obj[key]
  if (value === null || typeof value === 'string') return value
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value as string[]
  fail(`${where}.${key}`, 'a string, a list of strings, or null')
}

function row(value: unknown, where: string): Row {
  if (!isObject(value)) fail(where, 'an object')
  const status = value['status']
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
    fail(`${where}.status`, `one of ${STATUSES.join(', ')}`)
  }
  return {
    path: str(value, 'path', where),
    keyword_path: str(value, 'keyword_path', where),
    tag: str(value, 'tag', where),
    keyword: str(value, 'keyword', where),
    vr: str(value, 'vr', where),
    value_a: rowValue(value, 'value_a', where),
    value_b: rowValue(value, 'value_b', where),
    status: status as Row['status'],
    is_private: bool(value, 'is_private', where),
    private_creator: nullableStr(value, 'private_creator', where),
    is_priority: bool(value, 'is_priority', where),
    vr_a: nullableStr(value, 'vr_a', where),
    vr_b: nullableStr(value, 'vr_b', where),
    vr_mismatch: bool(value, 'vr_mismatch', where),
  }
}

function list<T>(value: unknown, where: string, item: (v: unknown, where: string) => T): T[] {
  if (!Array.isArray(value)) fail(where, 'a list')
  return value.map((v, i) => item(v, `${where}[${i}]`))
}

/** Validate parsed engine stdout. Throws {@link SchemaError}. */
export function parseCompareResult(value: unknown): CompareResult {
  if (!isObject(value)) fail('the document', 'a JSON object')
  const version = value['schema_version']
  if (version !== SCHEMA_VERSION) {
    throw new SchemaError(
      `Unsupported engine schema_version ${JSON.stringify(version ?? null)}; this app expects "${SCHEMA_VERSION}".`,
      'schema_mismatch',
    )
  }
  const files = value['files']
  if (!isObject(files)) fail('files', 'an object')
  return {
    schema_version: SCHEMA_VERSION,
    files: { a: fileInfo(files['a'], 'files.a'), b: fileInfo(files['b'], 'files.b') },
    summary: summary(value['summary']),
    warnings: list(value['warnings'], 'warnings', warning),
    rows: list(value['rows'], 'rows', row),
  }
}

/** Return the engine's stderr error document, or null if `value` is not one. */
export function parseEngineError(value: unknown): EngineErrorDocument['error'] | null {
  if (!isObject(value) || !isObject(value['error'])) return null
  const error = value['error']
  const file = error['file']
  if (typeof error['code'] !== 'string' || typeof error['message'] !== 'string') return null
  if (file !== null && file !== undefined && typeof file !== 'string') return null
  return { code: error['code'], message: error['message'], file: file ?? null }
}
