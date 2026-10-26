import type { Value } from '../../../shared/schema'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

/** Multi-valued elements are shown with the DICOM value separator. */
export function formatValue(value: Value | null): string {
  if (value === null) return ''
  return Array.isArray(value) ? value.join('\\') : value
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

/** Display label for a shortcut such as "Mod+Shift+O". */
export function shortcutLabel(keys: string): string {
  return keys.replace('Mod', isMac ? 'Cmd' : 'Ctrl')
}
