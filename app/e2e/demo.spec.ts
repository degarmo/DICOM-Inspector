/**
 * Scripted demo: drives the real app through the demo flow for each pair in
 * demo/pairs/ and writes the README screenshots (docs/img/) plus the raw frames
 * and timeline that scripts/demo-media.mjs turns into demo.gif and
 * demo-silent.mp4. Run with `npm run demo:capture`.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

import {
  assertNothingPersonalVisible,
  launchApp,
  REPO_DIR,
  stagePair,
  stubSaveDialog,
  type PairName,
} from './harness'

const IMG_DIR = join(REPO_DIR, 'docs', 'img')
const OUT_DIR = join(REPO_DIR, 'demo', 'out')
const FRAMES_DIR = join(OUT_DIR, 'frames')
const REPORTS_DIR = join(OUT_DIR, 'reports')

/** Seconds to hold on each beat of the recorded walkthrough (paced for voiceover). */
const HOLD = {
  loaded: 14,
  compared: 1.5,
  fullTable: 4,
  scroll: 14,
  afterScroll: 3,
  differencesOnly: 10,
  hover: 2.5,
  priorityDetail: 16,
  exported: 5,
  report: 6,
  reportScroll: 8,
  reportEnd: 10,
}

const pause = (seconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

async function capture(page: Page, name: string): Promise<void> {
  await assertNothingPersonalVisible(page)
  await page.screenshot({ path: join(IMG_DIR, name), scale: 'css' })
}

/**
 * Records the walkthrough as a stream of lossless PNG frames at the fixed
 * 1440x900 viewport (about 30 fps), plus named beats for the narration and GIF.
 */
class Recorder {
  private running = false
  private loop: Promise<void> = Promise.resolve()
  private origin = 0
  private readonly frames: { file: string; t: number }[] = []
  private readonly beats: { name: string; t: number }[] = []

  private now(): number {
    return Date.now() / 1000 - this.origin
  }

  start(page: Page): void {
    if (this.origin === 0) this.origin = Date.now() / 1000
    this.running = true
    this.loop = (async () => {
      while (this.running) {
        const t = this.now()
        const png = await page.screenshot({ scale: 'css', type: 'png' })
        const file = `frame-${String(this.frames.length).padStart(5, '0')}.png`
        writeFileSync(join(FRAMES_DIR, file), png)
        this.frames.push({ file, t })
      }
    })()
  }

  async stop(): Promise<void> {
    this.running = false
    await this.loop
  }

  beat(name: string): void {
    this.beats.push({ name, t: Number(this.now().toFixed(2)) })
  }

  write(): void {
    const duration = Number(this.now().toFixed(2))
    writeFileSync(join(OUT_DIR, 'timeline.json'), `${JSON.stringify({ duration, beats: this.beats }, null, 2)}\n`)
    writeFileSync(join(OUT_DIR, 'frames.json'), `${JSON.stringify({ duration, frames: this.frames }, null, 2)}\n`)
  }
}

/** Scroll an element (or the page) smoothly to its end over `seconds`. */
async function smoothScroll(page: Page, selector: string | null, seconds: number): Promise<void> {
  await page.evaluate(
    async ({ selector: target, ms }) => {
      const element = target ? document.querySelector<HTMLElement>(target) : document.scrollingElement
      if (!element) return
      const distance = element.scrollHeight - element.clientHeight
      const start = performance.now()
      await new Promise<void>((done) => {
        const step = (now: number): void => {
          const progress = Math.min(1, (now - start) / ms)
          const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2
          element.scrollTop = distance * eased
          if (progress < 1) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      })
    },
    { selector, ms: seconds * 1000 },
  )
}

async function waitForResult(page: Page): Promise<void> {
  await expect(page.getByTestId('priority-mismatches')).toBeVisible()
}

async function exportAndOpenReport(app: ElectronApplication, page: Page, name: string): Promise<string> {
  const report = join(REPORTS_DIR, `${name}-report.html`)
  await stubSaveDialog(app, report)
  await page.keyboard.press('Control+e')
  await expect(page.getByText(`Saved ${name}-report.html`)).toBeVisible()
  return report
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  mkdirSync(IMG_DIR, { recursive: true })
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(FRAMES_DIR, { recursive: true })
  mkdirSync(REPORTS_DIR, { recursive: true })
})

test('issuer mismatch: recorded walkthrough and screenshots 01-04', async () => {
  const { a, b } = stagePair('issuer')
  const { app, page } = await launchApp([a, b])
  const recorder = new Recorder()
  try {
    await expect(page.getByRole('button', { name: /^File B: site-b-rest\.dcm/ })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await assertNothingPersonalVisible(page)

    recorder.start(page)
    recorder.beat('loaded')
    await pause(HOLD.loaded)

    await page.keyboard.press('Control+Enter')
    await waitForResult(page)
    recorder.beat('compared')
    await pause(HOLD.compared)

    await page.getByRole('checkbox', { name: 'Differences only' }).uncheck()
    recorder.beat('full_table')
    await capture(page, '01-loaded.png')
    await pause(HOLD.fullTable)

    recorder.beat('scroll')
    await smoothScroll(page, '[data-testid="diff-table-body"]', HOLD.scroll)
    await smoothScrollToTop(page)
    recorder.beat('scroll_end')
    await pause(HOLD.afterScroll)

    await page.getByRole('checkbox', { name: 'Differences only' }).check()
    recorder.beat('differences_only')
    await expect(page.getByTestId('diff-row')).toHaveCount(1)
    await capture(page, '02-differences-only.png')
    await pause(HOLD.differencesOnly)

    const row = page.getByTestId('diff-row').first()
    await row.hover()
    recorder.beat('hover')
    await pause(HOLD.hover)
    await row.click()
    await expect(page.getByRole('region', { name: 'Selected row' })).toContainText('SYNTH-HOSP-B')
    recorder.beat('priority_detail')
    await capture(page, '03-priority-detail.png')
    await pause(HOLD.priorityDetail)

    const report = await exportAndOpenReport(app, page, 'issuer-mismatch')
    recorder.beat('exported')
    await pause(HOLD.exported)

    await recorder.stop()
    await page.goto(pathToFileURL(report).href)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('site-a-rest.dcm vs site-b-rest.dcm')
    recorder.start(page)
    recorder.beat('report')
    await capture(page, '04-report.png')
    await pause(HOLD.report)
    recorder.beat('report_scroll')
    await smoothScroll(page, null, HOLD.reportScroll)
    await pause(HOLD.reportEnd)
    recorder.beat('end')
    await recorder.stop()
    recorder.write()
  } finally {
    await app.close()
  }
})

async function smoothScrollToTop(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const element = document.querySelector<HTMLElement>('[data-testid="diff-table-body"]')
    if (!element) return
    const from = element.scrollTop
    const start = performance.now()
    await new Promise<void>((done) => {
      const step = (now: number): void => {
        const progress = Math.min(1, (now - start) / 1500)
        element.scrollTop = from * (1 - progress)
        if (progress < 1) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
  })
}

/** The same flow without recording, for the other pairs; one screenshot each. */
async function runPair(name: PairName, reportName: string, screenshot: string, detailText: string): Promise<void> {
  const { a, b } = stagePair(name)
  const { app, page } = await launchApp([a, b, '--compare'])
  try {
    await waitForResult(page)
    await page.getByRole('checkbox', { name: 'Differences only' }).uncheck()
    await expect(page.getByText('90 of 90 rows')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Differences only' }).check()
    await page.getByTestId('diff-row').first().click()
    await expect(page.getByRole('region', { name: 'Selected row' })).toContainText(detailText)
    await capture(page, screenshot)
    const report = await exportAndOpenReport(app, page, reportName)
    await page.goto(pathToFileURL(report).href)
    await expect(page.getByRole('heading', { level: 2, name: /All differences \(1\)/ })).toBeVisible()
    await assertNothingPersonalVisible(page)
  } finally {
    await app.close()
  }
}

test('blank accession: screenshot 06', async () => {
  await runPair('accession', 'blank-accession', '06-blank-accession.png', '(empty)')
})

test('nested difference: screenshot 07', async () => {
  await runPair(
    'nested',
    'nested-difference',
    '07-nested-difference.png',
    'RequestAttributesSequence[0].ScheduledProtocolCodeSequence[0].ProtocolContextSequence[0].TextValue',
  )
})

test('dark theme: screenshot 05', async () => {
  const { a, b } = stagePair('issuer')
  const { app, page } = await launchApp([a, b, '--compare'])
  try {
    await waitForResult(page)
    await page.getByTestId('diff-row').first().click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 17, 21)')
    // The drop zones fade between themes (transition-colors); wait until they are dark too.
    await expect(page.getByTestId('dropzone-File A')).toHaveCSS('background-color', 'rgb(23, 26, 32)')
    await capture(page, '05-dark.png')
  } finally {
    await app.close()
  }
})
