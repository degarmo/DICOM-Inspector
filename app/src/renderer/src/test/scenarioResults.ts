/** Real engine output for the Phase 4 scenarios (engine/tests/scenarios/goldens). */
import type { CompareResult } from '../../../shared/schema'
import { parseCompareResult } from '../../../shared/validate'

const goldens = import.meta.glob<unknown>('../../../../../engine/tests/scenarios/goldens/*.json', {
  eager: true,
  import: 'default',
})

export const SCENARIO_NAMES = Object.keys(goldens)
  .map((path) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length))
  .sort()

export function scenarioResult(name: string): CompareResult {
  const entry = Object.entries(goldens).find(([path]) => path.endsWith(`/${name}.json`))
  if (!entry) throw new Error(`No golden output for scenario ${name}`)
  return parseCompareResult(entry[1])
}
