import { execFile as nodeExecFile } from 'node:child_process'

import type { AppError, CompareOptions, CompareOutcome } from '../shared/api'
import { parseCompareResult, parseEngineError, SchemaError } from '../shared/validate'
import { engineCommand, type EngineCommand } from './engineCommand'

export const ENGINE_TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024
const MAX_RAW_TEXT_CHARS = 2000

export interface ExecError extends Error {
  /** Exit code for a nonzero exit, or a Node error code such as ENOENT. */
  code?: number | string | null
  signal?: NodeJS.Signals | null
}

export interface ExecOptions {
  cwd: string
  encoding: 'utf8'
  maxBuffer: number
  windowsHide: boolean
  shell: false
}

export type ExecCallback = (error: ExecError | null, stdout: string, stderr: string) => void

/** The subset of child_process.execFile the runner uses; injectable for tests. */
export type ExecFileFn = (
  file: string,
  args: string[],
  options: ExecOptions,
  callback: ExecCallback,
) => { kill(signal?: NodeJS.Signals): boolean }

export interface RunnerDeps {
  execFile: ExecFileFn
  command: EngineCommand
  timeoutMs: number
}

export function defaultRunnerDeps(): RunnerDeps {
  return { execFile: nodeExecFile as ExecFileFn, command: engineCommand(), timeoutMs: ENGINE_TIMEOUT_MS }
}

/** Arguments for one comparison. `--` stops a path like "-x.dcm" being read as a flag. */
export function compareArgs(command: EngineCommand, a: string, b: string, opts: CompareOptions): string[] {
  return [...command.args, 'compare', ...(opts.force ? ['--force'] : []), '--', a, b]
}

export function runCompare(
  a: string,
  b: string,
  opts: CompareOptions,
  deps: RunnerDeps = defaultRunnerDeps(),
): Promise<CompareOutcome> {
  return new Promise((resolve) => {
    let settled = false
    let child: ReturnType<ExecFileFn> | undefined

    const timer = setTimeout(() => {
      child?.kill('SIGKILL')
      finish(
        failure(
          'timeout',
          `The engine did not finish within ${Math.round(deps.timeoutMs / 1000)} seconds and was stopped.`,
        ),
      )
    }, deps.timeoutMs)

    const finish = (outcome: CompareOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }

    try {
      child = deps.execFile(
        deps.command.command,
        compareArgs(deps.command, a, b, opts),
        { cwd: deps.command.cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true, shell: false },
        (error, stdout, stderr) => finish(interpretExit(error, stdout, stderr, deps.command)),
      )
    } catch (error) {
      finish(failure('engine_failed', `Could not start the engine: ${describe(error)}`))
    }
  })
}

export function interpretExit(
  error: ExecError | null,
  stdout: string,
  stderr: string,
  command: EngineCommand,
): CompareOutcome {
  if (error && typeof error.code === 'string') {
    if (error.code === 'ENOENT') {
      return failure(
        'engine_not_found',
        `Could not start the engine: "${command.command}" was not found. Set DICOM_INSPECTOR_PYTHON ` +
          'to a Python 3.11+ interpreter that has the engine dependencies installed.',
      )
    }
    return failure('engine_failed', `The engine could not run (${error.code}): ${error.message}`)
  }

  if (!error) return parseStdout(stdout)

  if (typeof error.code !== 'number') {
    const how = error.signal ? `was terminated by ${error.signal}` : 'stopped unexpectedly'
    return failure('engine_failed', `The engine ${how}.${rawSuffix(stderr || stdout)}`)
  }

  const engineError = parseStderr(stderr)
  if (engineError) {
    return {
      ok: false,
      error: { code: engineError.code, message: engineError.message, ...(engineError.file ? { file: engineError.file } : {}) },
    }
  }
  return failure('engine_failed', `The engine exited with code ${error.code}.${rawSuffix(stderr || stdout)}`)
}

function parseStdout(stdout: string): CompareOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return failure('invalid_output', `The engine returned output that is not valid JSON.${rawSuffix(stdout)}`)
  }
  try {
    return { ok: true, result: parseCompareResult(parsed) }
  } catch (error) {
    if (error instanceof SchemaError) return failure(error.code, error.message)
    throw error
  }
}

/** The engine writes one JSON line; tolerate other text before it. */
function parseStderr(stderr: string): ReturnType<typeof parseEngineError> {
  const lines = stderr.trim().split(/\r?\n/)
  for (const candidate of [stderr.trim(), lines[lines.length - 1] ?? '']) {
    try {
      const found = parseEngineError(JSON.parse(candidate))
      if (found) return found
    } catch {
      // Not JSON; try the next candidate.
    }
  }
  return null
}

function rawSuffix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const clipped = trimmed.length > MAX_RAW_TEXT_CHARS ? `${trimmed.slice(0, MAX_RAW_TEXT_CHARS)}...` : trimmed
  return ` Output: ${clipped}`
}

function failure(code: string, message: string): { ok: false; error: AppError } {
  return { ok: false, error: { code, message } }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
