import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { app, BrowserWindow, dialog } from 'electron'

import type { ExportFormat, ExportOutcome } from '../shared/api'
import type { CompareResult } from '../shared/schema'
import { defaultReportName, renderReportHtml } from './report'

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  html: { name: 'HTML report', extensions: ['html'] },
  pdf: { name: 'PDF report', extensions: ['pdf'] },
}

export async function exportReport(
  owner: BrowserWindow | null,
  result: CompareResult,
  format: ExportFormat,
): Promise<ExportOutcome> {
  const now = new Date()
  const options: Electron.SaveDialogOptions = {
    title: `Export ${format.toUpperCase()} report`,
    defaultPath: join(app.getPath('documents'), defaultReportName(format, now)),
    filters: [FILTERS[format]],
  }
  const choice = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
  if (choice.canceled || !choice.filePath) return { ok: false, canceled: true }

  try {
    const html = renderReportHtml(result, now)
    if (format === 'html') {
      await writeFile(choice.filePath, html, 'utf8')
    } else {
      await writeFile(choice.filePath, await htmlToPdf(html))
    }
    return { ok: true, path: choice.filePath }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, canceled: false, error: { code: 'export_failed', message, file: choice.filePath } }
  }
}

/** Render the report in a hidden, script-less window and print it to PDF. */
async function htmlToPdf(html: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'dicom-inspector-'))
  const htmlPath = join(dir, 'report.html')
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
  })
  try {
    await writeFile(htmlPath, html, 'utf8')
    await window.loadFile(htmlPath)
    return await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
  } finally {
    window.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}
