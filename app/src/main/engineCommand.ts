import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { app } from 'electron'

/**
 * How to launch the comparison engine. This is the single place that knows
 * where the engine lives:
 * - packaged app: the frozen executable in resources/engine/,
 * - dev mode: a local Python interpreter running `-m dicom_inspector` from engine/.
 */
export interface EngineCommand {
  /** Executable to run. Passed to execFile directly; never through a shell. */
  command: string
  /** Arguments that come before the engine's own subcommand. */
  args: readonly string[]
  cwd: string
  /** What the user should do if the executable cannot be started. */
  notFoundHint: string
}

export interface EngineRuntime {
  packaged: boolean
  resourcesPath: string
  platform: NodeJS.Platform
}

/** engine/ relative to this file, both from src/main and from the built out/main. */
export const ENGINE_DIR = resolve(__dirname, '../../../engine')

export const ENGINE_EXE_BASENAME = 'dicom_inspector_engine'

export function currentRuntime(): EngineRuntime {
  // Outside Electron (unit tests), `app` is unavailable and this is never packaged.
  const packaged = Boolean(process.versions['electron']) && app.isPackaged
  return { packaged, resourcesPath: process.resourcesPath, platform: process.platform }
}

export function engineCommand(
  env: NodeJS.ProcessEnv = process.env,
  runtime: EngineRuntime = currentRuntime(),
): EngineCommand {
  if (runtime.packaged) {
    const dir = join(runtime.resourcesPath, 'engine')
    const exe = runtime.platform === 'win32' ? `${ENGINE_EXE_BASENAME}.exe` : ENGINE_EXE_BASENAME
    return { command: join(dir, exe), args: [], cwd: dir, notFoundHint: 'Reinstall DICOM Inspector.' }
  }
  return {
    command: env['DICOM_INSPECTOR_PYTHON'] || 'python',
    args: ['-m', 'dicom_inspector'],
    cwd: ENGINE_DIR,
    notFoundHint:
      'Set DICOM_INSPECTOR_PYTHON to a Python 3.11+ interpreter that has the engine dependencies installed.',
  }
}

/**
 * In a packaged app the engine must ship with it; return the missing path if it
 * does not. Dev-mode problems are reported when a comparison runs instead.
 */
export function missingPackagedEngine(
  runtime: EngineRuntime = currentRuntime(),
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (!runtime.packaged) return null
  const { command } = engineCommand(process.env, runtime)
  return exists(command) ? null : command
}
