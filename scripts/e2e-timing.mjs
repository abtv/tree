import { readFileSync } from 'node:fs'

const reportPath = process.argv[2] ?? 'test-results/e2e-timing.json'
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const rows = []
const files = new Map()
const modes = new Map()
const launches = []
const teardowns = []

function visit(suites, parents = []) {
  for (const suite of suites ?? []) {
    const titles = [...parents, suite.title].filter(Boolean)
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const title = [...titles, spec.title].join(' › ')
        const duration = (test.results ?? []).reduce((sum, result) => sum + result.duration, 0)
        const file = spec.file ?? suite.file ?? '(unknown file)'
        const mode = title.includes('[vim editing]')
          ? 'vim editing'
          : title.includes('[standard editing]')
            ? 'standard editing'
            : 'single mode'
        const annotations = test.results?.some((result) => result.annotations?.length)
          ? test.results.flatMap((result) => result.annotations ?? [])
          : (test.annotations ?? [])
        const ownLaunches = annotations
          .filter((annotation) => annotation.type === 'tree-launch-timing')
          .map((annotation) => JSON.parse(annotation.description))
        launches.push(...ownLaunches)
        teardowns.push(
          ...annotations
            .filter((annotation) => annotation.type === 'tree-teardown-timing')
            .map((annotation) => JSON.parse(annotation.description).duration),
        )
        rows.push({ title, file, duration, launches: ownLaunches.length })
        files.set(file, (files.get(file) ?? 0) + duration)
        modes.set(mode, (modes.get(mode) ?? 0) + duration)
      }
    }
    visit(suite.suites, titles)
  }
}

visit(report.suites)
const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`
const summed = rows.reduce((sum, row) => sum + row.duration, 0)
console.log(`E2E timing: ${reportPath}`)
console.log(
  `Tests: ${rows.length}; expected: ${report.stats.expected}; unexpected: ${report.stats.unexpected}; flaky: ${report.stats.flaky}; skipped: ${report.stats.skipped}`,
)
console.log(
  `Wall time: ${seconds(report.stats.duration)}; summed test time: ${seconds(summed)}; mean: ${seconds(rows.length ? summed / rows.length : 0)}`,
)
console.log('\nDuration buckets (summed attempts per test):')
for (const [label, min, max] of [
  ['under 1 s', 0, 1000],
  ['1–2 s', 1000, 2000],
  ['2–5 s', 2000, 5000],
  ['5–10 s', 5000, 10000],
  ['10 s or more', 10000, Infinity],
]) {
  console.log(`  ${label}: ${rows.filter((row) => row.duration >= min && row.duration < max).length}`)
}
for (const [heading, totals] of [
  ['Per-file totals', files],
  ['Per-editing-mode totals', modes],
]) {
  console.log(`\n${heading}:`)
  for (const [name, duration] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`  ${seconds(duration)}  ${name}`)
}
console.log('\n20 slowest tests:')
for (const row of [...rows].sort((a, b) => b.duration - a.duration).slice(0, 20))
  console.log(`  ${seconds(row.duration)}  ${row.title}`)
console.log(`\nLaunches: ${launches.length}; per test: ${(rows.length ? launches.length / rows.length : 0).toFixed(3)}`)
const counts = new Map()
for (const row of rows) counts.set(row.launches, (counts.get(row.launches) ?? 0) + 1)
for (const [count, tests] of [...counts].sort((a, b) => a[0] - b[0])) console.log(`  ${count} launches: ${tests} tests`)
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
console.log('\nLaunch phases (total / mean / median):')
for (const phase of ['cleanup', 'electronLaunch', 'firstWindow', 'assertions', 'total']) {
  const values = launches.map((launch) => launch[phase])
  const total = values.reduce((sum, value) => sum + value, 0)
  console.log(
    `  ${phase}: ${seconds(total)} / ${seconds(values.length ? total / values.length : 0)} / ${seconds(median(values))}`,
  )
}
const discrepancies = launches.map((launch) => {
  const phases = launch.cleanup + launch.electronLaunch + launch.firstWindow + launch.assertions
  return launch.total > 0 ? Math.abs(launch.total - phases) / launch.total : 0
})
console.log(
  `Phase reconciliation: ${discrepancies.filter((value) => value > 0.1).length} launches outside 10%; maximum discrepancy ${(100 * Math.max(0, ...discrepancies)).toFixed(2)}%`,
)
console.log(
  `Fixture teardown: ${teardowns.length} samples; total ${seconds(teardowns.reduce((sum, value) => sum + value, 0))}; median ${seconds(median(teardowns))}`,
)
if (report.stats.unexpected > 0 || report.errors?.length || discrepancies.some((value) => value > 0.1))
  process.exitCode = 1
