import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkAttribution, collectCommitMessages, findAttributionLine } from './check-attribution.mjs'

const temporaryDirectories = []

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-attribution-'))
  temporaryDirectories.push(root)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root })
  writeFileSync(join(root, 'file.txt'), 'first\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'chore(repo): seed fixture'], { cwd: root })
  return root
}

function commit(root, message, content) {
  writeFileSync(join(root, 'file.txt'), content)
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: root })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('findAttributionLine', () => {
  it('finds a Co-Authored-By line naming a known agent, case-insensitively', () => {
    expect(findAttributionLine('fix(x): y\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')).toBe(
      'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
    )
    expect(findAttributionLine('fix(x): y\n\nco-authored-by: Codex <noreply@openai.com>')).toBe(
      'co-authored-by: Codex <noreply@openai.com>',
    )
  })

  it('finds a "Generated with/by <agent>" line', () => {
    expect(findAttributionLine('🤖 Generated with [Claude Code](https://claude.com/claude-code)')).toBe(
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    )
  })

  it('leaves an ordinary human co-author line alone', () => {
    expect(findAttributionLine('fix(x): y\n\nCo-Authored-By: Jane Doe <jane@example.com>')).toBeUndefined()
  })

  it('handles missing text', () => {
    expect(findAttributionLine(undefined)).toBeUndefined()
    expect(findAttributionLine('')).toBeUndefined()
  })
})

describe('collectCommitMessages', () => {
  it('returns an empty list without a commit range', () => {
    expect(collectCommitMessages({ rootDirectory: createRepository() })).toEqual([])
  })

  it('collects full multi-line messages for every commit in the range', () => {
    const root = createRepository()
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
    const first = commit(root, 'feat(a): one', 'second\n')
    const second = commit(root, 'fix(b): two\n\nCo-Authored-By: Claude <noreply@anthropic.com>', 'third\n')

    const messages = collectCommitMessages({ rootDirectory: root, baseSha: base, headSha: second })

    expect(messages).toEqual([
      { hash: first, message: 'feat(a): one\n' },
      { hash: second, message: 'fix(b): two\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' },
    ])
  })
})

describe('checkAttribution', () => {
  it('reports no violations for a clean description and commit history', () => {
    expect(
      checkAttribution({
        prBody: 'Adds the thing.',
        commitMessages: [{ hash: 'abc1234', message: 'feat(x): add the thing' }],
      }),
    ).toEqual([])
  })

  it('reports the pull request description and every offending commit', () => {
    const violations = checkAttribution({
      prBody: '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      commitMessages: [
        { hash: 'abc1234000', message: 'feat(x): add the thing' },
        { hash: 'def5678000', message: 'fix(y): fix it\n\nCo-Authored-By: Codex <noreply@openai.com>' },
      ],
    })

    expect(violations).toEqual([
      { source: 'pull request description', line: '🤖 Generated with [Claude Code](https://claude.com/claude-code)' },
      { source: 'commit def5678', line: 'Co-Authored-By: Codex <noreply@openai.com>' },
    ])
  })
})
