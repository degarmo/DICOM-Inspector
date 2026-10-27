import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { IPC, type InspectorApi, type OpenFilesRequest } from '../shared/api'

const api: InspectorApi = {
  pickFile: () => ipcRenderer.invoke(IPC.pickFile),
  compare: (a, b, opts) => ipcRenderer.invoke(IPC.compare, a, b, { force: opts.force }),
  exportReport: (result, format) => ipcRenderer.invoke(IPC.exportReport, result, format),
  pathForFile: (file) => webUtils.getPathForFile(file),
  launchRequest: () => ipcRenderer.invoke(IPC.launchRequest),
  onOpenFiles: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, request: OpenFilesRequest): void => listener(request)
    ipcRenderer.on(IPC.openFiles, handler)
    return () => {
      ipcRenderer.removeListener(IPC.openFiles, handler)
    }
  },
}

contextBridge.exposeInMainWorld('inspector', api)
