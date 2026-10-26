import { ArrowLeft, ArrowRight, CircleCheck, EqualNot, type LucideIcon } from 'lucide-react'

import type { Status } from '../../../shared/schema'

export interface StatusMeta {
  label: string
  icon: LucideIcon
  /** Text colour class. */
  text: string
  /** Tinted background class. */
  soft: string
}

export const STATUS_META: Record<Status, StatusMeta> = {
  identical: { label: 'Identical', icon: CircleCheck, text: 'text-ok', soft: 'bg-ok-soft' },
  different: { label: 'Different', icon: EqualNot, text: 'text-diff', soft: 'bg-diff-soft' },
  only_in_a: { label: 'Only in A', icon: ArrowLeft, text: 'text-only-a', soft: 'bg-only-a-soft' },
  only_in_b: { label: 'Only in B', icon: ArrowRight, text: 'text-only-b', soft: 'bg-only-b-soft' },
}

/** Colour, icon and text label together; colour is never the only signal. */
export function StatusBadge({ status }: { status: Status }): React.JSX.Element {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${meta.text} ${meta.soft}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {meta.label}
    </span>
  )
}
