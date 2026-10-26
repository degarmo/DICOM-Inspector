import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('inspector', {})
