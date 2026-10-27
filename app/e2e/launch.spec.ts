/** The command-line feature in the real app: `<fileA> <fileB> [--compare]` and second launches. */
import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { APP_DIR, appEnv, electronBinary, launchApp, stagePair } from './harness'

test('opens and compares the pair given on the command line', async () => {
  const { a, b } = stagePair('issuer')
  const { app, page } = await launchApp([a, b, '--compare'])
  try {
    await expect(page.getByTestId('priority-mismatches')).toHaveText(/^1\s*priority mismatch$/)
    await expect(page.getByRole('button', { name: /^File A: site-a-rest\.dcm/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^File B: site-b-rest\.dcm/ })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('loads without comparing when --compare is absent', async () => {
  const { a, b } = stagePair('issuer')
  const { app, page } = await launchApp([a, b])
  try {
    await expect(page.getByRole('button', { name: /^File B: site-b-rest\.dcm/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Compare/ })).toBeEnabled()
    await expect(page.getByTestId('priority-mismatches')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('shows the load-panel error for a missing file instead of crashing', async () => {
  const { a, dir } = stagePair('issuer')
  const missing = join(dir, 'not here.dcm')
  const { app, page } = await launchApp([a, missing, '--compare'])
  try {
    await expect(page.getByRole('alert')).toContainText('File not found: not here.dcm')
    await expect(page.getByRole('button', { name: /^File A: site-a-rest\.dcm/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose File B' })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a second launch hands its files to the open window', async () => {
  const issuer = stagePair('issuer')
  const nested = stagePair('nested')
  const { app, page } = await launchApp([issuer.a, issuer.b, '--compare'])
  try {
    await expect(page.getByTestId('priority-mismatches')).toHaveText(/^1\s*priority mismatch$/)
    const second = spawn(electronBinary(), [APP_DIR, nested.a, nested.b, '--compare'], { env: appEnv(), stdio: 'ignore' })
    const exitCode = await new Promise<number | null>((resolve) => second.on('exit', resolve))
    expect(exitCode).toBe(0)
    await expect(page.getByRole('button', { name: /^File A: protocol-a\.dcm/ })).toBeVisible()
    await expect(page.getByTestId('priority-mismatches')).toHaveText(/^0\s*priority mismatches$/)
    expect(app.windows()).toHaveLength(1)
  } finally {
    await app.close()
  }
})
