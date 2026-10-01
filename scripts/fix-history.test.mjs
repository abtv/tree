import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DAYS,
  collectFixHistory,
  formatReport,
  isExcludedFromDefault,
  isFixSubject,
  parseArguments,
} from './fix-history.mjs'

const temporaryDirectories = []

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-fix-history-'))
  temporaryDirectories.push(root)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root })
  return root
}

function write(root, relativePath, content) {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

function commit(root, message, date, files) {
  for (const [relativePath, content] of Object.entries(files)) write(root, relativePath, content)
  execFileSync('git', ['add', '--all'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', message], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('isFixSubject', () => {
  it('recognizes the conventional and capitalized fix forms only', () => {
    expect(isFixSubject('fix(renderer): correct the caret')).toBe(true)
    expect(isFixSubject('fix: correct the caret')).toBe(true)
    expect(isFixSubject('Fix the caret')).toBe(true)
    expect(isFixSubject('feat(renderer): add a caret')).toBe(false)
    expect(isFixSubject('fixes the caret')).toBe(false)
    expect(isFixSubject('docs: fix the caret')).toBe(false)
  })
})

describe('isExcludedFromDefault', () => {
  it('excludes tests, documentation, and end-to-end files', () => {
    expect(isExcludedFromDefault('src/renderer/vim-editing.test.ts')).toBe(true)
    expect(isExcludedFromDefault('src/renderer/vim-editing.property.test.ts')).toBe(true)
    expect(isExcludedFromDefault('scripts/fix-history.test.mjs')).toBe(true)
    expect(isExcludedFromDefault('e2e/vim-editing.spec.ts')).toBe(true)
    expect(isExcludedFromDefault('docs/DEVELOPMENT.md')).toBe(true)
    expect(isExcludedFromDefault('src/renderer/vim-editing.ts')).toBe(false)
  })
})

describe('parseArguments', () => {
  it('parses a window, inline flags, and paths before and after the separator', () => {
    expect(parseArguments(['--days', '7', '--since', '2026-09-01', '--until=2026-09-30', 'src/a.ts'])).toEqual({
      days: 7,
      since: '2026-09-01',
      until: '2026-09-30',
      paths: ['src/a.ts'],
    })
    expect(parseArguments(['--', '--odd-name.ts'])).toEqual({
      days: DEFAULT_DAYS,
      since: undefined,
      until: undefined,
      paths: ['--odd-name.ts'],
    })
  })

  it('rejects an unknown option and a non-positive day count', () => {
    expect(() => parseArguments(['--grep', 'x'])).toThrow('unknown option')
    expect(() => parseArguments(['--days', '0'])).toThrow('positive integer')
  })
})

describe('collectFixHistory', () => {
  it('includes fixes inside the window, including the boundary, and excludes one before it', () => {
    const root = createRepository()
    commit(root, 'fix(vim): old', '2026-09-14T23:59:59Z', { 'src/a.ts': 'old\n' })
    commit(root, 'fix(vim): boundary', '2026-09-15T00:00:00Z', { 'src/a.ts': 'boundary\n' })
    commit(root, 'fix(vim): inside', '2026-09-20T12:00:00Z', { 'src/a.ts': 'inside\n' })
    commit(root, 'docs: note', '2026-09-25T12:00:00Z', { 'docs/note.md': 'note\n' })

    const report = collectFixHistory({
      rootDirectory: root,
      paths: ['src/a.ts'],
      since: '2026-09-15T00:00:00Z',
      until: '2026-09-30T00:00:00Z',
    })

    expect(report.files[0].commits.map((entry) => entry.subject)).toEqual(['fix(vim): inside', 'fix(vim): boundary'])
  })

  it('excludes HEAD itself from the listed fixes', () => {
    const root = createRepository()
    commit(root, 'fix(vim): first', '2026-09-20T12:00:00Z', { 'src/a.ts': 'one\n' })
    commit(root, 'fix(vim): second', '2026-09-21T12:00:00Z', { 'src/a.ts': 'two\n' })
    commit(root, 'fix(vim): head', '2026-09-22T12:00:00Z', { 'src/a.ts': 'three\n' })

    const report = collectFixHistory({ rootDirectory: root, paths: ['src/a.ts'], since: '2026-09-01T00:00:00Z' })

    expect(report.head.isFix).toBe(true)
    expect(report.files[0].commits.map((entry) => entry.subject)).toEqual(['fix(vim): second', 'fix(vim): first'])
    expect(report.signalFiles).toEqual([])
  })

  it('selects the production files changed in a fix commit at HEAD', () => {
    const root = createRepository()
    commit(root, 'fix(vim): repair', '2026-09-20T12:00:00Z', {
      'src/a.ts': 'one\n',
      'src/a.test.ts': 'test\n',
      'docs/note.md': 'doc\n',
      'e2e/a.spec.ts': 'e2e\n',
    })

    const report = collectFixHistory({ rootDirectory: root, since: '2026-09-01T00:00:00Z' })

    expect(report.defaulted).toBe(true)
    expect(report.files.map((file) => file.path)).toEqual(['src/a.ts'])
  })

  it('selects modified production files from the working-tree diff', () => {
    const root = createRepository()
    commit(root, 'feat(vim): add', '2026-09-20T12:00:00Z', { 'src/a.ts': 'one\n', 'src/b.ts': 'one\n' })
    write(root, 'src/a.ts', 'two\n')
    write(root, 'docs/note.md', 'doc\n')

    const report = collectFixHistory({ rootDirectory: root, since: '2026-09-01T00:00:00Z' })

    expect(report.defaulted).toBe(true)
    expect(report.files.map((file) => file.path)).toEqual(['src/a.ts'])
  })

  it('reports a possible shared cause when a file has three or more fixes', () => {
    const root = createRepository()
    commit(root, 'fix(vim): one', '2026-09-20T12:00:00Z', { 'src/a.ts': 'one\n' })
    commit(root, 'fix(vim): two', '2026-09-21T12:00:00Z', { 'src/a.ts': 'two\n' })
    commit(root, 'fix(vim): three', '2026-09-22T12:00:00Z', { 'src/a.ts': 'three\n' })
    commit(root, 'docs: note', '2026-09-23T12:00:00Z', { 'docs/note.md': 'note\n' })

    const report = collectFixHistory({ rootDirectory: root, paths: ['src/a.ts'], since: '2026-09-01T00:00:00Z' })
    const output = formatReport(report)

    expect(report.signalFiles).toEqual(['src/a.ts'])
    expect(output).toContain('Possible shared design cause')
    expect(output.split('\n').at(-1)).toContain('src/a.ts')
  })

  it('reports no matches for a file without fixes', () => {
    const root = createRepository()
    commit(root, 'feat(vim): add', '2026-09-20T12:00:00Z', { 'src/a.ts': 'one\n' })

    const report = collectFixHistory({ rootDirectory: root, paths: ['src/a.ts'], since: '2026-09-01T00:00:00Z' })

    expect(report.files[0].commits).toEqual([])
    expect(report.signalFiles).toEqual([])
    expect(formatReport(report)).toContain('no fix commits in window')
  })
})
