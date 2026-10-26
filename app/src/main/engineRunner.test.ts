import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeResult, makeRow } from '../test/builders'
import { engineCommand, ENGINE_DIR, type EngineCommand } from './engineCommand'
import { ENGINE_TIMEOUT_MS, runCompare, type ExecCallback, type ExecError, type ExecFileFn, type ExecOptions } from './engineRunner'

const COMMAND: EngineCommand = { command: '/usr/bin/python3', args: ['-m', 'dicom_inspector'], cwd: '/engine' }

interface Call {
  file: string
  args: string[]
  options: ExecOptions
  callback: ExecCallback
  kill: ReturnType<typeof vi.fn>
}

/** A fake execFile that records the call; the test decides when and how the process exits. */
function fakeExec(): { execFile: ExecFileFn; calls: Call[] } {
  const calls: Call[] = []
  const execFile: ExecFileFn = (file, args, options, callback) => {
    const kill = vi.fn(() => true)
    calls.push({ file, args, options, callback, kill })
    return { kill }
  }
  return { execFile, calls }
}

function exitError(code: number): ExecError {
  return Object.assign(new Error(`Command failed with exit code ${code}`), { code })
}

function start(force = false) {
  const fake = fakeExec()
  const outcome = runCompare('/x/a.dcm', '/x/b.dcm', { force }, { execFile: fake.execFile, command: COMMAND, timeoutMs: ENGINE_TIMEOUT_MS })
  const call = fake.calls[0]
  if (!call) throw new Error('execFile was not called')
  return { outcome, call }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runCompare', () => {
  it('runs the engine without a shell, with an args array, and returns the parsed result', async () => {
    const { outcome, call } = start()
    const result = makeResult([makeRow({ path: '(0010,0020)', status: 'different', value_b: 'B' })])
    call.callback(null, JSON.stringify(result), '')

    await expect(outcome).resolves.toEqual({ ok: true, result })
    expect(call.file).toBe('/usr/bin/python3')
    expect(call.args).toEqual(['-m', 'dicom_inspector', 'compare', '--', '/x/a.dcm', '/x/b.dcm'])
    expect(call.options).toMatchObject({ cwd: '/engine', shell: false, encoding: 'utf8' })
  })

  it('passes --force before the paths', () => {
    const { call } = start(true)
    expect(call.args).toEqual(['-m', 'dicom_inspector', 'compare', '--force', '--', '/x/a.dcm', '/x/b.dcm'])
  })

  it('maps exit 2 with a JSON error on stderr to the engine error', async () => {
    const { outcome, call } = start()
    const stderr = JSON.stringify({
      error: { code: 'not_dicom', message: "File is missing the DICOM preamble and 'DICM' prefix.", file: '/x/b.dcm' },
    })
    call.callback(exitError(2), '', `${stderr}\n`)

    await expect(outcome).resolves.toEqual({
      ok: false,
      error: { code: 'not_dicom', message: "File is missing the DICOM preamble and 'DICM' prefix.", file: '/x/b.dcm' },
    })
  })

  it('omits file when the engine error has none', async () => {
    const { outcome, call } = start()
    call.callback(exitError(1), '', JSON.stringify({ error: { code: 'internal_error', message: 'boom', file: null } }))
    await expect(outcome).resolves.toEqual({ ok: false, error: { code: 'internal_error', message: 'boom' } })
  })

  it('returns a generic error with the raw text when stderr is not JSON', async () => {
    const { outcome, call } = start()
    const traceback = 'Traceback (most recent call last):\nModuleNotFoundError: No module named pydicom'
    call.callback(exitError(1), '', traceback)

    const result = await outcome
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('engine_failed')
    expect(result.error.message).toContain('exited with code 1')
    expect(result.error.message).toContain('ModuleNotFoundError: No module named pydicom')
  })

  it('kills the process and returns a timeout error after 30 seconds', async () => {
    vi.useFakeTimers()
    const { outcome, call } = start()

    await vi.advanceTimersByTimeAsync(ENGINE_TIMEOUT_MS - 1)
    expect(call.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    const result = await outcome
    expect(call.kill).toHaveBeenCalledWith('SIGKILL')
    expect(result).toEqual({
      ok: false,
      error: { code: 'timeout', message: 'The engine did not finish within 30 seconds and was stopped.' },
    })
    // The process exiting after the timeout does not change the outcome.
    call.callback(Object.assign(new Error('killed'), { code: null, signal: 'SIGKILL' as const }), '', '')
    await expect(outcome).resolves.toEqual(result)
  })

  it('rejects a result with the wrong schema_version', async () => {
    const { outcome, call } = start()
    call.callback(null, JSON.stringify({ ...makeResult([]), schema_version: '2.0' }), '')

    const result = await outcome
    expect(result).toMatchObject({ ok: false, error: { code: 'schema_mismatch' } })
    if (!result.ok) expect(result.error.message).toContain('"2.0"')
  })

  it('rejects stdout that is not JSON', async () => {
    const { outcome, call } = start()
    call.callback(null, 'not json', '')
    await expect(outcome).resolves.toMatchObject({ ok: false, error: { code: 'invalid_output' } })
  })

  it('rejects JSON that does not match the schema', async () => {
    const { outcome, call } = start()
    const broken = { ...makeResult([]), rows: [{ path: '(0010,0010)' }] }
    call.callback(null, JSON.stringify(broken), '')
    await expect(outcome).resolves.toMatchObject({ ok: false, error: { code: 'invalid_output' } })
  })

  it('reports a missing interpreter clearly', async () => {
    const { outcome, call } = start()
    call.callback(Object.assign(new Error('spawn python ENOENT'), { code: 'ENOENT' }), '', '')
    const result = await outcome
    expect(result).toMatchObject({ ok: false, error: { code: 'engine_not_found' } })
    if (!result.ok) expect(result.error.message).toContain('DICOM_INSPECTOR_PYTHON')
  })
})

describe('engineCommand', () => {
  it('uses DICOM_INSPECTOR_PYTHON when set, with -m dicom_inspector from engine/', () => {
    expect(engineCommand({ DICOM_INSPECTOR_PYTHON: '/opt/py/bin/python' })).toEqual({
      command: '/opt/py/bin/python',
      args: ['-m', 'dicom_inspector'],
      cwd: ENGINE_DIR,
    })
    expect(ENGINE_DIR.replaceAll('\\', '/')).toMatch(/\/dicom-inspector\/engine$/)
  })

  it('falls back to "python"', () => {
    expect(engineCommand({}).command).toBe('python')
    expect(engineCommand({ DICOM_INSPECTOR_PYTHON: '' }).command).toBe('python')
  })
})
