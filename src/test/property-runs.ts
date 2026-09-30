// The renderer tsconfig has no Node types, and tests from every layer import this helper.
declare const process: { env: Record<string, string | undefined> }

/** Reads a positive number from an environment variable, or returns the fallback when it is unset. */
function readPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`)
  return value
}

/** The factor `TREE_PROPERTY_RUNS` applies to every property run count; 1 when unset. */
export const propertyRunScale = readPositiveNumber('TREE_PROPERTY_RUNS', 1)

/**
 * Scales a property's base run count by `TREE_PROPERTY_RUNS`, never below one run. `maxScale` caps the
 * factor for a property whose runs each build Vitest mocks (`vi.fn` through the typed doubles): Vitest
 * retains every mock it creates, so a run count in the thousands exhausts the worker heap.
 */
export function propertyRuns(base: number, maxScale = Number.POSITIVE_INFINITY): number {
  return Math.max(1, Math.round(base * Math.min(propertyRunScale, maxScale)))
}
