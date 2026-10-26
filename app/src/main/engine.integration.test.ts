/**
 * Runs the real Phase 1 engine against fixtures from engine/tests/make_fixtures.py.
 * Skipped, with the reason in the test name, when no usable Python is found.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { filterRows, DEFAULT_FILTERS, groupRows } from '../renderer/src/lib/filters'
import { engineCommand } from './engineCommand'
import { runCompare } from './engineRunner'

const command = engineCommand()

function pythonProblem(): string | null {
  try {
    execFileSync(command.command, ['-c', 'import pydicom, dicom_inspector'], { cwd: command.cwd, stdio: 'pipe' })
    return null
  } catch (error) {
    const code = (error as { code?: unknown }).code
    return code === 'ENOENT'
      ? `"${command.command}" not found; set DICOM_INSPECTOR_PYTHON`
      : `"${command.command}" cannot import pydicom/dicom_inspector; set DICOM_INSPECTOR_PYTHON to the engine venv`
  }
}

const problem = pythonProblem()
const title = problem ? `real engine (SKIPPED: ${problem})` : 'real engine'

describe.skipIf(problem !== null)(title, () => {
  let fixtures = ''

  beforeAll(() => {
    // Generate the Phase 1 fixtures into a temp dir so engine/ is never written to.
    fixtures = mkdtempSync(join(tmpdir(), 'dicom-inspector-fixtures-'))
    execFileSync(command.command, ['tests/make_fixtures.py', fixtures], { cwd: command.cwd, stdio: 'pipe' })
  })

  afterAll(() => {
    if (fixtures) rmSync(fixtures, { recursive: true, force: true })
  })

  it('compares the private-block pair and yields the expected UI counts', async () => {
    const outcome = await runCompare(
      join(fixtures, '05_private_block_a.dcm'),
      join(fixtures, '05_private_block_b.dcm'),
      { force: false },
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const { result } = outcome

    expect(result.schema_version).toBe('1.0')
    expect(result.summary).toEqual({
      total: 36,
      identical: 32,
      different: 0,
      only_in_a: 0,
      only_in_b: 4,
      priority_mismatches: 4,
    })
    expect(result.files.a.transfer_syntax?.name).toBe('Explicit VR Little Endian')
    expect(result.files.b.sop_class?.name).toBe('Secondary Capture Image Storage')

    // What the table shows by default: differences only, all priority, all private.
    const visible = filterRows(result.rows, DEFAULT_FILTERS)
    const { priority, other } = groupRows(visible)
    expect(visible).toHaveLength(4)
    expect(priority).toHaveLength(4)
    expect(other).toHaveLength(0)
    expect(new Set(priority.map((r) => r.private_creator))).toEqual(new Set(['SYNTHETIC_VENDOR_1']))
  })

  it('reports a non-DICOM file as an error naming that file', async () => {
    const b = join(fixtures, '09_not_dicom_b.txt')
    const outcome = await runCompare(join(fixtures, '09_not_dicom_a.dcm'), b, { force: true })
    expect(outcome).toMatchObject({ ok: false, error: { code: 'not_dicom', file: b } })
  })
})
