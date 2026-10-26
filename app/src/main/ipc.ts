import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'

import { IPC, type PickedFile } from '../shared/api'
import { runCompare } from './engineRunner'
import { isTrustedSender } from './security'

export function registerIpc(): void {
  ipcMain.handle(IPC.pickFile, async (event): Promise<PickedFile | null> => {
    assertTrusted(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a DICOM file',
      properties: ['openFile'],
      // Many DICOM files have no extension, so "All files" is the default filter.
      filters: [
        { name: 'All files', extensions: ['*'] },
        { name: 'DICOM', extensions: ['dcm', 'dicom', 'dic', 'ima'] },
      ],
    }
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const path = choice.filePaths[0]
    if (choice.canceled || !path) return null
    const info = await stat(path)
    return { path, name: basename(path), size: info.size }
  })

  ipcMain.handle(IPC.compare, (event, a: unknown, b: unknown, opts: unknown) => {
    assertTrusted(event)
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
      throw new TypeError('compare expects two file paths')
    }
    const force = typeof opts === 'object' && opts !== null && (opts as { force?: unknown }).force === true
    return runCompare(a, b, { force })
  })
}

export function assertTrusted(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event.senderFrame?.url)) {
    throw new Error('IPC request from an untrusted frame was rejected')
  }
}
