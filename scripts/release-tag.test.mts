import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { releaseTag } from './release-tag.mts'

const directories: string[] = []
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function fixture(version = '1.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'tree-release-tag-'))
  directories.push(root)
  const local = join(root, 'local')
  const remote = join(root, 'remote.git')
  mkdirSync(local)
  git(root, 'init', '--bare', '--quiet', remote)
  git(local, 'init', '--quiet')
  git(local, 'config', 'user.name', 'Release tests')
  git(local, 'config', 'user.email', 'release@example.com')
  git(local, 'config', 'commit.gpgSign', 'false')
  git(local, 'config', 'tag.gpgSign', 'false')
  writeFileSync(join(local, 'package.json'), JSON.stringify({ version }))
  git(local, 'add', 'package.json')
  git(local, 'commit', '--quiet', '-m', 'fixture')
  git(local, 'remote', 'add', 'origin', remote)
  return { local, remote, root }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('local release tagging', () => {
  it('runs every check in order before publishing only the tested tag, despite push defaults', () => {
    const { local, remote } = fixture()
    const commit = git(local, 'rev-parse', 'HEAD')
    const checks: string[][] = []
    git(local, 'config', 'push.followTags', 'true')
    git(local, 'config', 'remote.origin.mirror', 'true')
    git(local, 'tag', '-a', 'unrelated', '-m', 'Unrelated')

    const result = releaseTag(local, (args) => {
      expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe('')
      expect(git(local, 'tag', '--list', 'v1.2.3')).toBe('')
      checks.push([...args])
    })

    expect(result).toBe('v1.2.3')
    expect(checks).toEqual([
      ['run', 'check'],
      ['run', 'test:performance'],
      ['run', 'test:perf', '--', '--project=electron'],
    ])
    expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe('refs/tags/v1.2.3')
    expect(git(remote, 'rev-parse', 'v1.2.3^{}')).toBe(commit)
    expect(git(remote, 'cat-file', '-t', 'v1.2.3')).toBe('tag')
  })

  it.each([0, 1, 2])('never creates or pushes a tag when check %s fails', (failed) => {
    const { local, remote } = fixture()
    let calls = 0

    expect(() =>
      releaseTag(local, () => {
        if (calls++ === failed) throw new Error('check failed')
      }),
    ).toThrow('check failed')

    expect(calls).toBe(failed + 1)
    expect(git(local, 'tag', '--list')).toBe('')
    expect(git(remote, 'for-each-ref')).toBe('')
  })

  it.each(['tracked', 'staged', 'untracked'])('refuses %s changes before checking', (kind) => {
    const { local } = fixture()
    writeFileSync(join(local, kind === 'untracked' ? 'new.txt' : 'package.json'), 'changed')
    if (kind === 'staged') git(local, 'add', 'package.json')

    expect(() =>
      releaseTag(local, () => {
        throw new Error('must not run')
      }),
    ).toThrow('local changes')
    expect(git(local, 'tag', '--list')).toBe('')
  })

  it.each(['local', 'remote'])('refuses an existing %s tag without replacing it', (location) => {
    const { local, remote } = fixture()
    git(local, 'tag', 'v1.2.3')
    const original = git(local, 'rev-parse', 'v1.2.3')
    if (location === 'remote') {
      git(local, 'push', '--quiet', 'origin', 'refs/tags/v1.2.3')
      git(local, 'tag', '-d', 'v1.2.3')
    }

    expect(() =>
      releaseTag(local, () => {
        throw new Error('must not run')
      }),
    ).toThrow('already exists')
    expect(git(location === 'local' ? local : remote, 'rev-parse', 'v1.2.3')).toBe(original)
  })

  it.each(['file', 'commit', 'remote', 'tag'])('stops if validation changes the %s', (change) => {
    const { local, remote } = fixture()
    let changed = false

    expect(() =>
      releaseTag(local, () => {
        if (changed) return
        changed = true
        if (change === 'file') writeFileSync(join(local, 'new.txt'), 'changed')
        if (change === 'commit') git(local, 'commit', '--quiet', '--allow-empty', '-m', 'changed')
        if (change === 'remote') git(local, 'remote', 'set-url', 'origin', 'missing.git')
        if (change === 'tag') git(local, 'tag', 'v1.2.3')
      }),
    ).toThrow()

    expect(git(remote, 'for-each-ref')).toBe('')
  })

  it('checks the push destination rather than the fetch destination', () => {
    const { local, root } = fixture()
    const pushRemote = join(root, 'push.git')
    git(root, 'init', '--bare', '--quiet', pushRemote)
    git(local, 'tag', 'v1.2.3')
    git(local, 'push', '--quiet', pushRemote, 'refs/tags/v1.2.3')
    git(local, 'tag', '-d', 'v1.2.3')
    git(local, 'remote', 'set-url', '--push', 'origin', pushRemote)

    expect(() =>
      releaseTag(local, () => {
        throw new Error('must not run')
      }),
    ).toThrow('already exists in origin')
  })

  it('fails closed on unavailable or multiple push destinations', () => {
    const { local } = fixture()
    git(local, 'remote', 'set-url', '--push', 'origin', '/missing-release-remote.git')

    expect(() =>
      releaseTag(local, () => {
        throw new Error('must not run')
      }),
    ).toThrow('ls-remote')

    git(local, 'remote', 'set-url', '--add', '--push', 'origin', '/another-remote.git')

    expect(() =>
      releaseTag(local, () => {
        throw new Error('must not run')
      }),
    ).toThrow('exactly one push URL')
  })

  it('retains the local tag when the remote rejects the push', () => {
    const { local, remote } = fixture()
    const hook = join(remote, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })

    expect(() => releaseTag(local, () => {})).toThrow('Local tag v1.2.3 was retained')

    expect(git(local, 'rev-parse', 'v1.2.3^{}')).toBe(git(local, 'rev-parse', 'HEAD'))
    expect(git(remote, 'for-each-ref')).toBe('')
  })

  it('preserves a remote tag created while validation is running', () => {
    const { local, remote } = fixture()
    const original = git(local, 'rev-parse', 'HEAD')

    expect(() =>
      releaseTag(local, () => {
        git(local, 'push', '--quiet', remote, `${original}:refs/tags/v1.2.3`)
      }),
    ).toThrow('already exists in origin')

    expect(git(local, 'tag', '--list')).toBe('')
    expect(git(remote, 'rev-parse', 'v1.2.3')).toBe(original)
  })

  it.each(['1.2', '1.2.3;echo bad', '01.2.3', '1.2.3-01'])('rejects invalid version %s', (version) => {
    const { local } = fixture(version)

    expect(() =>
      releaseTag(local, () => {
        throw new Error('must not run')
      }),
    ).toThrow('semantic version')
  })

  it('CLI help and unknown arguments never start validation or publish', () => {
    const script = new URL('./release-tag.mts', import.meta.url)
    const help = spawnSync(process.execPath, [script.pathname, '--help'], { encoding: 'utf8' })
    const invalid = spawnSync(process.execPath, [script.pathname, '--force'], { encoding: 'utf8' })

    expect(help.status).toBe(0)
    expect(help.stdout).toContain('Usage: npm run release:tag')
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toContain('accepts no arguments')
  })

  it.each([false, true])('CLI executes npm checks before push (check failure: %s)', (fail) => {
    const { local, remote, root } = fixture()
    const bin = join(root, 'bin')
    const log = join(root, 'checks.log')
    mkdirSync(bin)
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$RELEASE_TEST_LOG"\nexit ${fail ? 1 : 0}\n`, {
      mode: 0o755,
    })

    const result = spawnSync(process.execPath, [new URL('./release-tag.mts', import.meta.url).pathname], {
      cwd: local,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RELEASE_TEST_LOG: log },
    })

    expect(result.status, result.stderr).toBe(fail ? 1 : 0)
    expect(readFileSync(log, 'utf8')).toBe(
      fail ? 'run check\n' : 'run check\nrun test:performance\nrun test:perf -- --project=electron\n',
    )
    expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe(fail ? '' : 'refs/tags/v1.2.3')
    expect(git(local, 'tag', '--list')).toBe(fail ? '' : 'v1.2.3')
  })
})
