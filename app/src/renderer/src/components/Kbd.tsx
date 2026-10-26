import { shortcutLabel } from '../lib/format'

export function Kbd({ keys }: { keys: string }): React.JSX.Element {
  return (
    <kbd className="rounded border border-current/25 px-1 font-sans text-[10px] leading-4 font-medium opacity-80">
      {shortcutLabel(keys)}
    </kbd>
  )
}
