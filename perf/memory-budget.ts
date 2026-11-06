export type MemoryMetrics = Record<string, number>
export type MemoryBudget = Record<string, { maxBytes: number; growthBytes?: number }>

export function memoryViolations(samples: readonly MemoryMetrics[], budget: MemoryBudget): string[] {
  if (Object.keys(budget).length === 0) throw new Error('No memory budgets configured')
  if (samples.length === 0) return ['No memory samples were collected']
  const failures: string[] = []
  for (const [metric, limit] of Object.entries(budget)) {
    if (
      !Number.isFinite(limit.maxBytes) ||
      limit.maxBytes <= 0 ||
      (limit.growthBytes !== undefined && (!Number.isFinite(limit.growthBytes) || limit.growthBytes < 0))
    ) {
      throw new Error(`Invalid memory budget: ${metric}`)
    }
    const baseline = samples[0]![metric]
    for (const [index, sample] of samples.entries()) {
      const value = sample[metric]
      if (value === undefined || !Number.isFinite(value) || value <= 0) {
        failures.push(`${metric} sample ${index}: missing or invalid measurement`)
        continue
      }
      if (value > limit.maxBytes)
        failures.push(`${metric} sample ${index}: ${value} bytes exceeds ceiling ${limit.maxBytes}`)
      if (limit.growthBytes !== undefined && baseline !== undefined && value - baseline > limit.growthBytes)
        failures.push(
          `${metric} sample ${index}: growth ${value - baseline} bytes exceeds ${limit.growthBytes} (baseline ${baseline}, current ${value})`,
        )
    }
  }
  return failures
}

export function assertMemoryBudget(samples: readonly MemoryMetrics[], budget: MemoryBudget): void {
  const failures = memoryViolations(samples, budget)
  if (failures.length) throw new Error(`Memory budget exceeded:\n${failures.join('\n')}`)
}
