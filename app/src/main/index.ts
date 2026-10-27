import { join } from 'node:path'

import { app, BrowserWindow, nativeTheme } from 'electron'

import { IPC, type OpenFilesRequest } from '../shared/api'
import { missingPackagedEngine } from './engineCommand'
import { engineMissingPage } from './engineMissing'
import { registerIpc } from './ipc'
import { absoluteArgs, launchArgsFromData, parseLaunchArgs, resolveOpenRequest } from './launchArgs'
import { configureSecurity } from './security'

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']

// `DICOM Inspector.exe <fileA> <fileB> [--compare]`. Relative paths are resolved
// here so the request means the same thing if it is handed to another instance.
const launchArgs = absoluteArgs(parseLaunchArgs(process.argv, process.defaultApp === true), process.cwd())

let mainWindow: BrowserWindow | null = null
let launchRequest: Promise<OpenFilesRequest | null> = resolveOpenRequest(launchArgs)

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'DICOM Inspector',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f6f7f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  const missingEngine = missingPackagedEngine()
  if (missingEngine) {
    void window.loadURL(engineMissingPage(missingEngine))
  } else if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow = window
  return window
}

// One instance at a time: a second launch hands its files to the open window.
if (!app.requestSingleInstanceLock(launchArgs)) {
  app.quit()
} else {
  app.on('second-instance', (_event, _argv, _workingDirectory, additionalData) => {
    const request = resolveOpenRequest(launchArgsFromData(additionalData))
    if (!mainWindow) {
      launchRequest = request
      if (app.isReady()) createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const target = mainWindow
    void request.then((resolved) => {
      if (resolved && !target.isDestroyed()) target.webContents.send(IPC.openFiles, resolved)
    })
  })

  void app.whenReady().then(() => {
    configureSecurity(devServerUrl)
    registerIpc({ launchRequest: () => launchRequest })
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
