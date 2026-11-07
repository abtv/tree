import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkReleaseNoteRange } from './check-release-notes.mts'
import { parseReleaseNote, validateReleaseNote } from './release-note.mts'

describe('release-note policy', () => {
  it.each(['feat(editor)', 'fix(memory)', 'perf(renderer)', 'feat', 'fix', 'perf'])('requires notes for %s', (type) => {
    expect(() => validateReleaseNote(`${type}: Change behavior`)).toThrow('require Release-Note')
    expect(() =>
      validateReleaseNote(`${type}: Change behavior\n\nRelease-Note: Explain the user outcome.`),
    ).not.toThrow()
    expect(() =>
      validateReleaseNote(`${type}: Internal work\n\nRelease-Note: none: Test infrastructure only.`),
    ).not.toThrow()
  })

  it.each([
    ['Release-Note:', 'must contain'],
    ['Release-Note: none', 'requires a reason'],
    ['Release-Note: none:  ', 'requires a reason'],
    ['Release-Note: First\nRelease-Note: Second', 'exactly one'],
  ])('rejects malformed notes: %s', (body, error) => {
    expect(() => validateReleaseNote(`fix(editor): Change\n\n${body}`)).toThrow(error)
  })

  it('keeps other commit types optional and handles CRLF and case-insensitive fields', () => {
    expect(() => validateReleaseNote('docs(release): Explain notes')).not.toThrow()
    expect(parseReleaseNote('Details\r\n\r\nrelease-note: User outcome.\r\n')).toEqual({ text: 'User outcome.' })
    expect(parseReleaseNote('Release-Note: NONE: CI only.')).toEqual({ reason: 'CI only.' })
    expect(parseReleaseNote('Legacy body')).toBeUndefined()
  })

  it.each([
    'feat(editor)!: Change behavior',
    'refactor(storage)!: Change format',
    'fix(editor): Change behavior\n\nBREAKING CHANGE: Export first.',
    'chore(release): Change platform\n\nBREAKING-CHANGE: Upgrade macOS.',
  ])('does not let breaking changes opt out: %s', (message) => {
    expect(() => validateReleaseNote(`${message}\n\nRelease-Note: none: Internal.`)).toThrow('cannot use')
  })

  it('runs the real Git hook and CI range check, retaining legacy history', () => {
    const parent = resolve('.scratch/release-note-policy/git-tests')
    mkdirSync(parent, { recursive: true })
    const cwd = mkdtempSync(`${parent}/repo-`)
    const hook = resolve('.githooks')
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const commit = (message: string) => {
      git('-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', message)
      return git('rev-parse', 'HEAD')
    }

    try {
      git('init')
      git('config', 'user.name', 'Synthetic')
      git('config', 'user.email', 'synthetic@example.test')
      git('config', 'commit.gpgsign', 'false')
      const base = commit('chore(repo): Seed')
      const legacy = commit('feat(editor): Legacy without note')
      const messageFile = resolve(cwd, 'message.txt')
      const attempt = (message: string) => {
        writeFileSync(messageFile, message)
        return spawnSync('git', ['-c', `core.hooksPath=${hook}`, 'commit', '--allow-empty', '-F', messageFile], {
          cwd,
          encoding: 'utf8',
        })
      }

      expect(checkReleaseNoteRange(base, legacy, cwd, legacy)).toEqual([])
      const rejected = attempt('fix(search): Technical subject')
      expect(rejected.status).not.toBe(0)
      expect(rejected.stderr).toContain('require Release-Note')
      expect(git('rev-parse', 'HEAD')).toBe(legacy)

      expect(
        attempt('fix(search): Subject\n\nRelease-Note: Results stay visible.\n# Release-Note: comment').status,
      ).toBe(0)
      expect(checkReleaseNoteRange(base, git('rev-parse', 'HEAD'), cwd, legacy)).toEqual([])
      expect(attempt('fix(memory): Test tooling\n\nRelease-Note: none: Measurement tooling only.').status).toBe(0)
      expect(attempt('fix(search): Subject\n\nRelease-Note: none').status).not.toBe(0)
      expect(attempt('chore(repo): Subject\n\nCo-Authored-By: Codex <synthetic@example.test>').status).not.toBe(0)

      const bad = commit('perf(renderer): Missing note without hook')
      expect(checkReleaseNoteRange(base, bad, cwd, legacy)).toEqual([expect.stringContaining(`${bad.slice(0, 7)}:`)])
      expect(() => checkReleaseNoteRange('--all', bad, cwd, legacy)).toThrow('full base and head SHAs')
      expect(() => checkReleaseNoteRange(base, 'f'.repeat(40), cwd, legacy)).toThrow()

      const cli = spawnSync(process.execPath, [resolve('scripts/check-release-notes.mts')], {
        env: { ...process.env, BASE_SHA: '', HEAD_SHA: '' },
        encoding: 'utf8',
      })
      expect(cli.status).not.toBe(0)
      expect(cli.stderr).toContain('BASE_SHA and HEAD_SHA are required')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
