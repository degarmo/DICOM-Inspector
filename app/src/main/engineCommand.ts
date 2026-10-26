import { resolve } from 'node:path'

/**
 * How to launch the comparison engine. This is the single swap point between
 * dev mode (a local Python interpreter running `-m dicom_inspector` from
 * engine/) and a packaged build (a frozen executable).
 */
export interface EngineCommand {
  /** Executable to run. Passed to execFile directly; never through a shell. */
  command: string
  /** Arguments that come before the engine's own subcommand. */
  args: readonly string[]
  cwd: string
}

/** engine/ relative to this file, both from src/main and from the built out/main. */
export const ENGINE_DIR = resolve(__dirname, '../../../engine')

export function engineCommand(env: NodeJS.ProcessEnv = process.env): EngineCommand {
  return {
    command: env['DICOM_INSPECTOR_PYTHON'] || 'python',
    args: ['-m', 'dicom_inspector'],
    cwd: ENGINE_DIR,
  }
}
