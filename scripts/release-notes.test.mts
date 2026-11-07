import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatReleaseNotes, releaseNotes } from './release-notes.mts'

const lock = (electron: string, react = '19.0.0', vite = '8.0.0') => ({
  packages: {
    '': { dependencies: { react: '^19' } },
    'node_modules/electron': { version: electron },
    'node_modules/react': { version: react },
    'node_modules/vite': { version: vite },
  },
})

describe('release notes', () => {
  it('groups user changes, deduplicates entries and omits internal work', () => {
    const result = formatReleaseNotes(
      [
        { subject: 'feat(editor): Toggle line numbers' },
        { subject: 'fix(tags): Match without case' },
        { subject: 'fix(tags): Match without case' },
        { subject: 'perf(renderer): Reduce redraws' },
        ...['docs', 'test', 'ci', 'build', 'chore', 'refactor'].map((type) => ({
          subject: `${type}(editor): Hidden work`,
        })),
        { subject: 'fix(memory): Retry captures' },
        { subject: 'Legacy message' },
      ],
      lock('44'),
      lock('45', '19.1.0', '9.0.0'),
      'https://example.test/compare',
    )

    expect(result).toContain('## Added\n\n- Toggle line numbers')
    expect(result).toContain('## Improved\n\n- Reduce redraws')
    expect(result.match(/Match without case/g)).toHaveLength(1)
    expect(result).not.toMatch(/Hidden work|Retry captures|Legacy message|vite/)
    expect(result).toContain('electron: 44 → 45')
    expect(result).toContain('react: 19.0.0 → 19.1.0')
    expect(result).toContain('[Full changes](https://example.test/compare)')
  })

  it('retains breaking changes even for internal commits', () => {
    const result = formatReleaseNotes(
      [
        { subject: 'chore(release)!: Require a newer macOS version' },
        { subject: 'refactor(storage): Update format', body: 'BREAKING CHANGE: Export notes before upgrading.' },
      ],
      undefined,
      lock('45'),
      'link',
    )

    expect(result).toContain('## Breaking changes')
    expect(result).toContain('Require a newer macOS version')
    expect(result).toContain('Export notes before upgrading.')
    expect(result).not.toContain('## Dependencies')
  })

  it('does not invent changes for an empty range or unchanged dependencies', () => {
    expect(formatReleaseNotes([], lock('45'), lock('45'), 'link')).toBe(
      'No notable user-facing changes detected.\n\n[Full changes](link)',
    )
  })

  it('reads actual Git history and locked dependencies at the pinned commit', () => {
    const parent = resolve('.scratch/release-notes/git-tests')
    mkdirSync(parent, { recursive: true })
    const cwd = mkdtempSync(`${parent}/repo-`)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const commit = (subject: string, version: string) => {
      writeFileSync(resolve(cwd, 'package-lock.json'), JSON.stringify(lock(version)))
      git('add', 'package-lock.json')
      git(
        '-c',
        'user.name=Synthetic',
        '-c',
        'user.email=synthetic@example.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        subject,
      )
      return git('rev-parse', 'HEAD')
    }

    try {
      git('init')
      commit('feat(editor): Old feature', '44')
      git('tag', 'v1.0.0')
      const sha = commit('fix(editor): Correct new behavior', '45')
      commit('feat(editor): Future feature', '46')
      git('tag', 'v2.0.0')

      const result = releaseNotes(sha, 'v1.0.0', cwd)

      expect(result).toContain('Correct new behavior')
      expect(result).toContain('electron: 44 → 45')
      expect(result).not.toMatch(/Old feature|Future feature|45 → 46/)
      expect(result).toContain(`https://github.com/abtv/tree/compare/v1.0.0...${sha}`)
      expect(releaseNotes(sha, undefined, cwd)).toContain('Old feature')
      expect(() => releaseNotes(sha, 'v999999.0.0', cwd)).toThrow()
      expect(() => releaseNotes(sha, 'v2.0.0', cwd)).toThrow()
      expect(() => releaseNotes('--all', undefined, cwd)).toThrow('Invalid release notes range')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
