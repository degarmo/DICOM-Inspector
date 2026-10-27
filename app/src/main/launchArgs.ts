import { stat as fsStat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import type { AppError, OpenFilesRequest, PickedFile } from '../shared/api'

/**
 * Command-line usage: `DICOM Inspector.exe <fileA> <fileB> [--compare]`.
 * Paths that start with "-" can follow a `--` separator.
 */
export interface LaunchArgs {
  files: string[]
  compare: boolean
}

/**
 * Pull the file paths and --compare out of an Electron argv.
 *
 * argv starts with the executable. When Electron runs an unpackaged app
 * (`electron <appDir> ...`, i.e. dev mode and tests) the first positional
 * argument is the app directory and is skipped. Other switches, such as the
 * ones Chromium, Node or test runners add, are ignored.
 */
export function parseLaunchArgs(argv: readonly string[], runsFromAppDir: boolean): LaunchArgs {
  const positional: string[] = []
  let compare = false
  let literal = false
  for (const arg of argv.slice(1)) {
    if (literal) positional.push(arg)
    else if (arg === '--') literal = true
    else if (arg === '--compare') compare = true
    else if (!arg.startsWith('-')) positional.push(arg)
  }
  const files = runsFromAppDir ? positional.slice(1) : positional
  return { files: files.slice(0, 2), compare }
}

/** Absolute paths, so a request can be handed to another instance with a different cwd. */
export function absoluteArgs(args: LaunchArgs, cwd: string): LaunchArgs {
  return { files: args.files.map((file) => resolve(cwd, file)), compare: args.compare }
}

type Stat = (path: string) => Promise<{ isFile(): boolean; size: number }>

/** Check each path; missing or non-file paths become load-panel errors instead of slots. */
export async function resolveOpenRequest(args: LaunchArgs, stat: Stat = fsStat): Promise<OpenFilesRequest | null> {
  if (args.files.length === 0) return null
  const files: OpenFilesRequest['files'] = { a: null, b: null }
  const errors: AppError[] = []
  const slots = ['a', 'b'] as const
  for (const [index, path] of args.files.entries()) {
    const slot = slots[index]
    if (!slot) break
    try {
      const info = await stat(path)
      if (info.isFile()) {
        files[slot] = { path, name: basename(path), size: info.size } satisfies PickedFile
      } else {
        errors.push({ code: 'not_a_file', message: `Not a regular file: ${path}`, file: path })
      }
    } catch {
      errors.push({ code: 'file_not_found', message: `File not found: ${path}`, file: path })
    }
  }
  return { files, compare: args.compare && errors.length === 0 && files.a !== null && files.b !== null, errors }
}

/** Launch arguments handed over by a second instance (Electron's additionalData). */
export function launchArgsFromData(data: unknown): LaunchArgs {
  if (typeof data !== 'object' || data === null) return { files: [], compare: false }
  const { files, compare } = data as { files?: unknown; compare?: unknown }
  return {
    files: Array.isArray(files) ? files.filter((file): file is string => typeof file === 'string').slice(0, 2) : [],
    compare: compare === true,
  }
}
