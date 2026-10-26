import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { IPC, type InspectorApi } from '../shared/api'

const api: InspectorApi = {
  pickFile: () => ipcRenderer.invoke(IPC.pickFile),
  compare: (a, b, opts) => ipcRenderer.invoke(IPC.compare, a, b, { force: opts.force }),
  exportReport: (result, format) => ipcRenderer.invoke(IPC.exportReport, result, format),
  pathForFile: (file) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('inspector', api)
