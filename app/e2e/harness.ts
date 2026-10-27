/** Shared helpers for driving the real built app with Playwright's Electron support. */
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir, hostname, tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

export const APP_DIR = resolve(__dirname, '..')
export const REPO_DIR = resolve(APP_DIR, '..')
export const DEMO_PAIRS_DIR = join(REPO_DIR, 'demo', 'pairs')
export const VIEWPORT = { width: 1440, height: 900 }

/** The demo pairs, copied to a neutral folder under readable names. */
export const PAIRS = {
  issuer: { source: '01_issuer_mismatch', a: 'site-a-rest.dcm', b: 'site-b-rest.dcm' },
  accession: { source: '04_accession_blank', a: 'order-linked.dcm', b: 'order-blank.dcm' },
  nested: { source: '14_nested_three_levels', a: 'protocol-a.dcm', b: 'protocol-b.dcm' },
} as const
export type PairName = keyof typeof PAIRS

function enginePython(): string {
  const configured = process.env['DICOM_INSPECTOR_PYTHON']
  if (configured) return configured
  for (const candidate of [
    join(REPO_DIR, 'engine', '.venv', 'bin', 'python'),
    join(REPO_DIR, 'engine', '.venv', 'Scripts', 'python.exe'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    'No engine Python found. Create engine/.venv (see README) or set DICOM_INSPECTOR_PYTHON.',
  )
}

/** Environment for the app: the engine's Python, and never Electron-as-Node mode. */
export function appEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
  }
  env['DICOM_INSPECTOR_PYTHON'] = enginePython()
  return env
}

export function electronBinary(): string {
  // The electron package's main export is the path of its executable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron') as unknown as string
}

/** Copy a demo pair into <tmp>/DICOM Inspector Demo/<name>/ and return the two paths. */
export function stagePair(name: PairName): { a: string; b: string; dir: string } {
  const pair = PAIRS[name]
  const dir = join(tmpdir(), 'DICOM Inspector Demo', pair.source)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const a = join(dir, pair.a)
  const b = join(dir, pair.b)
  copyFileSync(join(DEMO_PAIRS_DIR, pair.source, 'A.dcm'), a)
  copyFileSync(join(DEMO_PAIRS_DIR, pair.source, 'B.dcm'), b)
  return { a, b, dir }
}

export async function launchApp(args: string[]): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: electronBinary(),
    args: [APP_DIR, ...args],
    env: appEnv(),
  })
  const page = await app.firstWindow()
  await page.setViewportSize(VIEWPORT)
  await page.emulateMedia({ colorScheme: 'light' })
  return { app, page }
}

/** Make the next save dialog return `target` without showing anything. */
export async function stubSaveDialog(app: ElectronApplication, target: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, target)
}

const FORBIDDEN = [homedir(), hostname(), `/Users/${userInfo().username}`, `\\Users\\${userInfo().username}`].filter(
  (value) => value.length > 3,
)

/** Fail if any visible text could identify this machine or its user. */
export async function assertNothingPersonalVisible(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText)
  for (const value of FORBIDDEN) expect(text.toLowerCase()).not.toContain(value.toLowerCase())
  expect(text).not.toMatch(/[A-Za-z]:\\Users\\|\/Users\/|\/home\//)
}
