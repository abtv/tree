import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface PerfRange {
  min: number
  max: number
}

export interface PerfResultInput {
  kind: string
  scenario: string
  metrics: Record<string, number | PerfRange>
  samples?: number
}

export interface PerfArtifact {
  createdAt: string
  environment: {
    platform: string
    arch: string
    node: string
  }
  metrics: Record<string, Record<string, number>>
}

const DEFAULT_TOLERANCE = 1.5

export function flattenMetrics(metrics: Record<string, number | PerfRange>): Record<string, number> {
  const flattened: Record<string, number> = {}
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') {
      flattened[key] = value
    } else {
      flattened[`${key}.min`] = value.min
      flattened[`${key}.max`] = value.max
    }
  }
  return flattened
}

export function compareMetrics(
  current: Record<string, number>,
  baseline: Record<string, number>,
  tolerance: number,
): string[] {
  const failures: string[] = []
  for (const [key, currentValue] of Object.entries(current)) {
    const baselineValue = baseline[key]
    if (baselineValue === undefined) {
      failures.push(`${key}: missing from baseline`)
      continue
    }
    if (baselineValue <= 0) continue
    const ratio = currentValue / baselineValue
    if (ratio > tolerance) {
      failures.push(`${key}: ${currentValue} vs baseline ${baselineValue} (${ratio.toFixed(2)}x > ${tolerance}x)`)
    }
  }
  return failures
}

export function readArtifact(path: string): PerfArtifact {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (isNotFound(error)) throw error
    throw new Error(`The performance artifact at ${path} could not be read: ${messageOf(error)}`, { cause: error })
  }
  if (!isRecord(parsed) || !isRecord(parsed.environment) || !isRecord(parsed.metrics)) {
    throw new Error(`The performance artifact at ${path} is invalid.`)
  }
  return parsed as unknown as PerfArtifact
}

export function recordPerfResult(input: PerfResultInput): void {
  const metrics = flattenMetrics(input.metrics)
  console.log(
    `PERF ${JSON.stringify({
      kind: input.kind,
      scenario: input.scenario,
      ...(input.samples === undefined ? {} : { samples: input.samples }),
      ...input.metrics,
    })}`,
  )
  writeArtifact(input.kind, input.scenario, metrics)
  compareWithBaseline(input.kind, input.scenario, metrics)
}

function compareWithBaseline(kind: string, scenario: string, metrics: Record<string, number>): void {
  const baselinePath = process.env['PERF_BASELINE']
  if (baselinePath === undefined || baselinePath === '') return
  const baseline = readArtifact(baselinePath)
  const key = `${kind}:${scenario}`
  const baselineMetrics = baseline.metrics[key]
  if (baselineMetrics === undefined) {
    throw new Error(`Performance baseline has no entry for ${key}; record a new baseline.`)
  }
  if (baseline.environment.platform !== process.platform || baseline.environment.arch !== process.arch) {
    console.warn(
      `PERF baseline was recorded on ${baseline.environment.platform}/${baseline.environment.arch}; same-machine comparison is more reliable.`,
    )
  }
  const failures = compareMetrics(metrics, baselineMetrics, readTolerance())
  if (failures.length > 0) {
    throw new Error(`Performance baseline comparison failed for ${key}:\n${failures.join('\n')}`)
  }
}

function readTolerance(): number {
  const raw = process.env['PERF_REGRESSION_TOLERANCE']
  if (raw === undefined || raw === '') return DEFAULT_TOLERANCE
  const tolerance = Number(raw)
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('PERF_REGRESSION_TOLERANCE must be a positive number.')
  }
  return tolerance
}

function artifactPath(): string {
  return process.env['PERF_RESULTS'] ?? join(process.cwd(), 'test-results', 'perf-results.json')
}

function writeArtifact(kind: string, scenario: string, metrics: Record<string, number>): void {
  const path = artifactPath()
  const existing = readExistingArtifact(path)
  const artifact: PerfArtifact = {
    createdAt: new Date().toISOString(),
    environment: { platform: process.platform, arch: process.arch, node: process.version },
    metrics: { ...(existing?.metrics ?? {}), [`${kind}:${scenario}`]: metrics },
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`)
}

function readExistingArtifact(path: string): PerfArtifact | undefined {
  try {
    return readArtifact(path)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
