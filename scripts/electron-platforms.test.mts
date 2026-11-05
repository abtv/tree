import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { linuxFiles, sharedClipboardTitles, sharedFiles } from '../config/testing/electron-platforms.ts'

interface Spec {
  title: string
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
      cases.push({ ...spec, key: JSON.stringify([spec.file, ...path, spec.title]) })
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

  for (const file of [...linuxFiles, ...sharedFiles]) {
    expect(
      linux.some((spec) => basename(spec.file) === file),
      `Unmatched platform file: ${file}`,
    ).toBe(true)
  }
  expect(new Set([...linuxKeys, ...macosKeys])).toEqual(keys(full))
  const overlap = full.filter(({ key }) => linuxKeys.has(key) && macosKeys.has(key))
  const expectedOverlap = full.filter(
    ({ file, title }) =>
      sharedFiles.includes(basename(file)) ||
      (basename(file) === 'clipboard.spec.ts' && sharedClipboardTitles.test(title)),
  )
  expect(keys(overlap)).toEqual(keys(expectedOverlap))
  console.info(
    `Electron allocation: ${full.length} total, ${linux.length} Linux, ${macos.length} macOS, ${overlap.length} shared`,
  )

  for (const spec of linux) {
    const path = resolve('e2e/electron', spec.file)
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    let callback: ts.Node | undefined
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'test' &&
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 === spec.line
      ) {
        callback = node.arguments.at(-1)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)

    expect(callback, spec.key).toBeDefined()
    expect(callback!.getText(source), spec.key).not.toMatch(/\b(?:toHaveScreenshot|toMatchSnapshot)\s*\(/)
  }
}, 120_000)
