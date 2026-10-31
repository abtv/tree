import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { commitReleaseVersion } from './release-tag.mts'
import { compareVersions, parseVersion } from './release-version.mts'

const directories: string[] = []
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
function fixture() {
  const local = mkdtempSync(join(tmpdir(), 'tree-version-'))
  directories.push(local)
  git(local, 'init', '--quiet')
  git(local, 'config', 'user.name', 'Release tests')
  git(local, 'config', 'user.email', 'release@example.com')
  git(local, 'config', 'commit.gpgSign', 'false')
  writeFileSync(join(local, 'package.json'), JSON.stringify({ version: '1.2.3' }, null, 2) + '\n')
  writeFileSync(
    join(local, 'package-lock.json'),
    JSON.stringify(
      {
        version: '1.2.3',
        lockfileVersion: 3,
        packages: { '': { version: '1.2.3' }, dependency: { version: '9.0.0' } },
      },
      null,
      2,
    ) + '\n',
  )
  git(local, 'add', '.')
  git(local, 'commit', '--quiet', '-m', 'fixture')
  return local
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it.each(['1.2', '01.2.3', '1.2.3-01', '1.2.3\n', '1.2.3;echo bad'])('rejects invalid version %j', (version) => {
  expect(() => parseVersion(version)).toThrow('Invalid semantic version')
})

describe('local release version commit', () => {
  it.each([
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['major', '2.0.0'],
  ] as const)('commits %s without a remote or tag', (kind, expected) => {
    const local = fixture()
    const before = git(local, 'rev-parse', 'HEAD')

    expect(commitReleaseVersion(local, kind)).toBe(expected)

    expect(git(local, 'log', '-1', '--format=%s')).toBe(`chore(release): bump version to ${expected}`)
    expect(git(local, 'rev-parse', 'HEAD^')).toBe(before)
    expect(git(local, 'tag', '--list')).toBe('')
    expect(git(local, 'status', '--porcelain')).toBe('')
    const lock = JSON.parse(readFileSync(join(local, 'package-lock.json'), 'utf8'))
    expect(lock.version).toBe(expected)
    expect(lock.packages[''].version).toBe(expected)
    expect(lock.packages.dependency.version).toBe('9.0.0')
  })
  it.each(['untracked', 'staged', 'unstaged'])('preserves %s changes', (kind) => {
    const local = fixture()
    writeFileSync(join(local, kind === 'untracked' ? 'notes.txt' : 'package.json'), 'keep edit')
    if (kind === 'staged') git(local, 'add', 'package.json')

    expect(() => commitReleaseVersion(local)).toThrow('local changes')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('1')
  })
  it('leaves rejected commits reviewable and refuses to bump them twice', () => {
    const local = fixture()
    writeFileSync(join(local, '.git/hooks/commit-msg'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })

    expect(() => commitReleaseVersion(local)).toThrow('commit')
    expect(() => commitReleaseVersion(local)).toThrow('local changes')

    expect(JSON.parse(readFileSync(join(local, 'package.json'), 'utf8')).version).toBe('1.2.4')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('1')
  })
  it('rejects inconsistent package versions before editing', () => {
    const local = fixture()
    writeFileSync(join(local, 'package.json'), '{"version":"1.2.8"}')
    git(local, 'add', 'package.json')
    git(local, 'commit', '--quiet', '-m', 'mismatch')

    expect(() => commitReleaseVersion(local)).toThrow('versions must match')
    expect(git(local, 'status', '--porcelain')).toBe('')
  })
  it('CLI succeeds offline without executing npm checks', () => {
    const local = fixture()
    const bin = join(local, '.git', 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 99\n', { mode: 0o755 })
    git(local, 'remote', 'add', 'origin', '/missing-network-remote')

    const result = spawnSync(process.execPath, [new URL('./release-tag.mts', import.meta.url).pathname], {
      cwd: local,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Committed version 1.2.4')
    expect(git(local, 'tag', '--list')).toBe('')
  })
  it.each(['--help', '--force'])('CLI handles %s without editing', (arg) => {
    const local = fixture()
    const result = spawnSync(process.execPath, [new URL('./release-tag.mts', import.meta.url).pathname, arg], {
      cwd: local,
      encoding: 'utf8',
    })

    expect(result.status).toBe(arg === '--help' ? 0 : 1)
    expect(git(local, 'status', '--porcelain')).toBe('')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('1')
  })
})

it.each([
  ['1.2.10', '1.2.9', 1],
  ['2.0.0', '1.99.99', 1],
  ['1.2.3', '1.2.3-rc.1', 1],
  ['1.2.3+build', '1.2.3', 0],
  ['1.2.3-rc.9', '1.2.3-rc.10', -1],
  ['1.2.3-1', '1.2.3-alpha', -1],
  ['1.2.3-alpha', '1.2.3-alpha.1', -1],
  ['9007199254740992.0.0', '9007199254740991.0.0', 1],
])('compares %s and %s using semantic precedence', (a, b, expected) => {
  expect(compareVersions(a as string, b as string)).toBe(expected)
})
