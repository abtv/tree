import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MemoryProbe } from './memory-probe'

it('persists each sample before checking the budget, including a failing sample', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tree-memory-report-'))
  const info = { titlePath: ['memory'], outputPath: (...parts: string[]) => join(directory, ...parts), attachments: [] }

  try {
    const probe = new MemoryProbe(info, { heap: { maxBytes: 100 } })
    probe.record('warm', { heap: 50 })

    expect(() => probe.record('failure', { heap: 101 })).toThrow('ceiling 100')

    const lines = readFileSync(join(directory, 'memory-samples.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(lines.map((line) => line.event)).toEqual(['start', 'sample', 'sample'])
    expect(lines.at(-1)).toMatchObject({ label: 'failure', metrics: { heap: 101 } })
    expect(info.attachments).toHaveLength(1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
