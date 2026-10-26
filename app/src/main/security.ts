import { app, session, type WebContents } from 'electron'

/**
 * Hardening applied to every window:
 * - all network requests are cancelled (only local app files are allowed),
 * - every permission request (camera, notifications, ...) is denied,
 * - navigation away from the app entry and window.open are blocked.
 */

let allowedDevOrigin: string | null = null

export function configureSecurity(devServerUrl: string | undefined): void {
  allowedDevOrigin = devServerUrl ? new URL(devServerUrl).origin : null

  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isLocalRequest(details.url) })
  })

  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents))
}

export function isLocalRequest(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (['file:', 'data:', 'blob:', 'devtools:', 'chrome-extension:'].includes(parsed.protocol)) {
    return true
  }
  if (allowedDevOrigin === null) return false
  const devOrigin = new URL(allowedDevOrigin)
  if (parsed.origin === allowedDevOrigin) return true
  // Vite's HMR websocket on the same host and port.
  return (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') && parsed.host === devOrigin.host
}

/** IPC is only accepted from the app's own page. */
export function isTrustedSender(frameUrl: string | undefined): boolean {
  if (!frameUrl) return false
  try {
    const url = new URL(frameUrl)
    if (allowedDevOrigin !== null) return url.origin === allowedDevOrigin
    return url.protocol === 'file:'
  } catch {
    return false
  }
}

function hardenWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAppEntry(url, contents.getURL())) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isAppEntry(url, contents.getURL())) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

/** Navigation is only allowed to reload the page that is already loaded. */
function isAppEntry(target: string, current: string): boolean {
  try {
    const t = new URL(target)
    const c = new URL(current)
    return t.protocol === c.protocol && t.host === c.host && t.pathname === c.pathname
  } catch {
    return false
  }
}
