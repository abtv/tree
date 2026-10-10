import { appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { compareArtifacts, readArtifact, readTolerance } from '../perf/results.ts'

/**
 * Renders the report-only comparison of a performance run with an earlier one.
 * `regressions` is null when no earlier run was available to compare with.
 */
export function renderReport(regressions, tolerance) {
  if (regressions === null) {
    return '## Performance drift\n\nNo earlier performance run was available, so this run becomes the next baseline.\n'
  }
  if (regressions.length === 0) {
    return `## Performance drift\n\nNo metric exceeds ${tolerance}x its value in the previous run.\n`
  }
  const lines = regressions.map((line) => `- ${line}`).join('\n')
  return [
    '## Performance drift',
    '',
    `${regressions.length} metric(s) exceed ${tolerance}x their value in the previous run. This report does not fail the run: single-sample and frame-quantized metrics vary between runs without a code change.`,
    '',
    lines,
    '',
  ].join('\n')
}

export function runReport(currentPath, baselinePath) {
  if (currentPath === undefined || baselinePath === undefined) {
    throw new Error('Usage: node scripts/perf-report.mjs <current-results.json> <baseline-results.json>')
  }
  const tolerance = readTolerance()
  const regressions = existsSync(baselinePath)
    ? compareArtifacts(readArtifact(currentPath), readArtifact(baselinePath), tolerance)
    : null
  const report = renderReport(regressions, tolerance)
  const summaryPath = process.env['GITHUB_STEP_SUMMARY']
  if (summaryPath !== undefined && summaryPath !== '') appendFileSync(summaryPath, report)
  return report
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(runReport(process.argv[2], process.argv[3]))
}
