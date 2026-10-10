import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { renderReport, runReport } from './perf-report.mjs'

const directories = []
const originalEnvironment = { ...process.env }

function artifactFile(name, metrics) {
  const directory = mkdtempSync(join(tmpdir(), 'tree-perf-report-'))
  directories.push(directory)
  const path = join(directory, name)
  const artifact = {
    createdAt: new Date(0).toISOString(),
    environment: { platform: 'darwin', arch: 'arm64', node: 'v24' },
    metrics,
  }
  writeFileSync(path, JSON.stringify(artifact))
  return path
}

afterEach(() => {
  process.env = { ...originalEnvironment }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('renderReport', () => {
  it('says so when no earlier run was available', () => {
    expect(renderReport(null, 1.5)).toContain('becomes the next baseline')
  })

  it('reports a clean comparison', () => {
    expect(renderReport([], 1.5)).toContain('No metric exceeds 1.5x')
  })

  it('lists each regression and states that the run is not failed', () => {
    const report = renderReport(['typing:a: paintP95Ms: 20 vs baseline 10 (2.00x > 1.5x)'], 1.5)

    expect(report).toContain('1 metric(s) exceed 1.5x')
    expect(report).toContain('- typing:a: paintP95Ms: 20 vs baseline 10 (2.00x > 1.5x)')
    expect(report).toContain('does not fail the run')
  })
})

describe('runReport', () => {
  it('lists regressions against the baseline file and appends them to the job summary', () => {
    const current = artifactFile('current.json', { 'typing:a': { paintP95Ms: 30 } })
    const baseline = artifactFile('baseline.json', { 'typing:a': { paintP95Ms: 10 } })
    const summary = join(mkdtempSync(join(tmpdir(), 'tree-perf-summary-')), 'summary.md')
    directories.push(join(summary, '..'))
    process.env['GITHUB_STEP_SUMMARY'] = summary

    const report = runReport(current, baseline)

    expect(report).toContain('typing:a: paintP95Ms: 30 vs baseline 10 (3.00x > 1.5x)')
    expect(readFileSync(summary, 'utf8')).toBe(report)
  })

  it('honors PERF_REGRESSION_TOLERANCE', () => {
    const current = artifactFile('current.json', { 'typing:a': { paintP95Ms: 30 } })
    const baseline = artifactFile('baseline.json', { 'typing:a': { paintP95Ms: 10 } })
    process.env['PERF_REGRESSION_TOLERANCE'] = '4'

    expect(runReport(current, baseline)).toContain('No metric exceeds 4x')
  })

  it('treats a missing baseline file as a first run instead of failing', () => {
    const current = artifactFile('current.json', { 'typing:a': { paintP95Ms: 30 } })

    expect(runReport(current, join(tmpdir(), 'tree-perf-report-missing', 'perf-results.json'))).toContain(
      'becomes the next baseline',
    )
  })

  it('requires both paths', () => {
    expect(() => runReport(undefined, undefined)).toThrow(/Usage/)
  })
})
