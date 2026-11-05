import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'
import { expect, it } from 'vitest'
import { linuxFiles, sharedClipboardTag, sharedFiles } from '../config/testing/electron-platforms.ts'

interface Spec {
  title: string
  tags: string[]
  file: string
  line: number
  tests: { expectedStatus: string }[]
}
interface Suite {
  title: string
  suites?: Suite[]
  specs?: Spec[]
}
interface Case extends Spec {
  key: string
}

function discover(config: string): Case[] {
  // --list loads the real configuration and parameterized tests without running
  // global setup, launching Electron, or touching the system clipboard.
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '-c',
      `config/testing/playwright${config}.config.ts`,
      '--list',
      '--reporter=json',
    ],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
  )

  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  const report = JSON.parse(result.stdout) as { suites: Suite[]; errors: unknown[] }
  expect(report.errors).toEqual([])
  const cases: Case[] = []
  const visit = (suite: Suite, parents: string[]) => {
    const path = [...parents, suite.title]
    for (const spec of suite.specs ?? []) {
      expect(spec.tests).toHaveLength(1)
      expect(spec.tests[0]!.expectedStatus).toBe('passed')
      cases.push({
        ...spec,
        tags: spec.tags.map((tag) => `@${tag}`),
        key: JSON.stringify([spec.file, ...path, spec.title]),
      })
    }
    for (const child of suite.suites ?? []) visit(child, path)
  }
  for (const suite of report.suites) visit(suite, [])
  expect(cases.length).toBeGreaterThan(0)
  expect(new Set(cases.map(({ key }) => key)).size).toBe(cases.length)
  return cases
}

it('allocates every discovered Electron case with only the declared platform overlap', () => {
  const full = discover('')
  const linux = discover('.linux')
  const macos = discover('.macos')
  const keys = (cases: Case[]) => new Set(cases.map(({ key }) => key))
  const linuxKeys = keys(linux)
  const macosKeys = keys(macos)

  // Both native text-clipboard boundaries must keep both editing modes, even if
  // their human-readable titles change or a selector accidentally matches none.
  for (const tag of ['@shared-clipboard-text', '@shared-clipboard-link']) {
    const selected = full.filter((spec) => spec.tags.includes(tag))
    expect(selected, tag).toHaveLength(2)
    for (const mode of ['vim', 'standard']) {
      expect(
        selected.filter(({ key }) => key.includes(`[${mode} editing]`)),
        `${tag}: ${mode}`,
      ).toHaveLength(1)
    }
    for (const spec of selected) {
      expect(basename(spec.file)).toBe('clipboard.spec.ts')
      expect(linuxKeys.has(spec.key), spec.key).toBe(true)
      expect(macosKeys.has(spec.key), spec.key).toBe(true)
    }
  }

  for (const file of [...linuxFiles, ...sharedFiles]) {
    expect(
      linux.some((spec) => basename(spec.file) === file),
      `Unmatched platform file: ${file}`,
    ).toBe(true)
  }
  expect(new Set([...linuxKeys, ...macosKeys])).toEqual(keys(full))
  const overlap = full.filter(({ key }) => linuxKeys.has(key) && macosKeys.has(key))
  const expectedOverlap = full.filter(
    ({ file, tags }) =>
      sharedFiles.includes(basename(file)) ||
      (basename(file) === 'clipboard.spec.ts' && tags.some((tag) => sharedClipboardTag.test(tag))),
  )
  expect(keys(overlap)).toEqual(keys(expectedOverlap))
  console.info(
    `Electron allocation: ${full.length} total, ${linux.length} Linux, ${macos.length} macOS, ${overlap.length} shared`,
  )
}, 120_000)
