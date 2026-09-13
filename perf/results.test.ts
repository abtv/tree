import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compareMetrics, flattenMetrics, readArtifact, recordPerfResult, type PerfArtifact } from './results'

const temporaryDirectories: string[] = []
const originalEnvironment = { ...process.env }

function temporaryPath(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'tree-perf-results-'))
  temporaryDirectories.push(directory)
  return join(directory, name)
}

afterEach(() => {
  process.env = { ...originalEnvironment }
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('flattenMetrics', () => {
  it('keeps numbers and expands ranges into min and max keys', () => {
    expect(flattenMetrics({ typingMs: 12, launchMs: { min: 3, max: 5 } })).toEqual({
      typingMs: 12,
      'launchMs.min': 3,
      'launchMs.max': 5,
    })
  })
})

describe('compareMetrics', () => {
  it('reports metrics above the tolerance ratio', () => {
    expect(compareMetrics({ paintP95Ms: 160 }, { paintP95Ms: 100 }, 1.5)).toEqual([
      'paintP95Ms: 160 vs baseline 100 (1.60x > 1.5x)',
    ])
  })

  it('accepts metrics within tolerance and improvements', () => {
    expect(compareMetrics({ paintP95Ms: 140, typingMs: 80 }, { paintP95Ms: 100, typingMs: 100 }, 1.5)).toEqual([])
  })

  it('ignores metrics missing from the baseline and non-positive baselines', () => {
    expect(compareMetrics({ newMetric: 100, zeroMetric: 100 }, { zeroMetric: 0 }, 1.5)).toEqual([])
  })
})

describe('recordPerfResult', () => {
  it('writes and merges artifacts', () => {
    const path = temporaryPath('perf-results.json')
    process.env['PERF_RESULTS'] = path

    recordPerfResult({ kind: 'typing', scenario: 'wide-1000', samples: 104, metrics: { paintP95Ms: 30 } })
    recordPerfResult({
      kind: 'state',
      scenario: 'large-10000',
      metrics: { typingMs: 200, launchMs: { min: 1, max: 2 } },
    })

    const artifact = readArtifact(path)
    expect(Object.keys(artifact.metrics)).toEqual(['typing:wide-1000', 'state:large-10000'])
    expect(artifact.metrics['typing:wide-1000']).toEqual({ paintP95Ms: 30 })
    expect(artifact.metrics['state:large-10000']).toEqual({ typingMs: 200, 'launchMs.min': 1, 'launchMs.max': 2 })
    expect(artifact.environment.platform).toBe(process.platform)
  })

  it('fails when a metric exceeds the baseline tolerance', () => {
    const baselinePath = temporaryPath('baseline.json')
    writeBaseline(baselinePath, { paintP95Ms: 10 })
    process.env['PERF_RESULTS'] = temporaryPath('perf-results.json')
    process.env['PERF_BASELINE'] = baselinePath

    expect(() => recordPerfResult({ kind: 'typing', scenario: 'wide-1000', metrics: { paintP95Ms: 20 } })).toThrow(
      /Performance regressions in typing:wide-1000/,
    )
  })

  it('passes when metrics stay within the baseline tolerance', () => {
    const baselinePath = temporaryPath('baseline.json')
    const resultsPath = temporaryPath('perf-results.json')
    writeBaseline(baselinePath, { paintP95Ms: 10 })
    process.env['PERF_RESULTS'] = resultsPath
    process.env['PERF_BASELINE'] = baselinePath

    recordPerfResult({ kind: 'typing', scenario: 'wide-1000', metrics: { paintP95Ms: 12 } })

    expect(readArtifact(resultsPath).metrics['typing:wide-1000']).toEqual({ paintP95Ms: 12 })
  })
})

describe('readArtifact', () => {
  it('rejects invalid artifacts', () => {
    const path = temporaryPath('invalid.json')
    writeFileSync(path, '{"metrics":{}}')

    expect(() => readArtifact(path)).toThrow(/is invalid/)
  })
})

function writeBaseline(path: string, metrics: Record<string, number>): void {
  const artifact: PerfArtifact = {
    createdAt: new Date(0).toISOString(),
    environment: { platform: process.platform, arch: process.arch, node: process.version },
    metrics: { 'typing:wide-1000': metrics },
  }
  writeFileSync(path, JSON.stringify(artifact))
}
