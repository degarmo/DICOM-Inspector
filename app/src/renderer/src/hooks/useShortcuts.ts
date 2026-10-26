import { useEffect, useRef } from 'react'

export interface ShortcutHandlers {
  openA(): void
  openB(): void
  compare(): void
  exportReport(): void
}

/** Ctrl+O, Ctrl+Shift+O, Ctrl+Enter, Ctrl+E (Cmd on macOS). */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      let action: (() => void) | null = null
      if (key === 'o') action = event.shiftKey ? latest.current.openB : latest.current.openA
      else if (key === 'enter' && !event.shiftKey) action = latest.current.compare
      else if (key === 'e' && !event.shiftKey) action = latest.current.exportReport
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
