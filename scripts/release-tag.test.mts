import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { releaseTag } from './release-tag.mts'

const directories: string[] = []
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function fixture(version = '1.2.2') {
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
  writeFileSync(join(local, 'package.json'), JSON.stringify({ version }, null, 2) + '\n')
  writeFileSync(
    join(local, 'package-lock.json'),
    JSON.stringify(
      { version, lockfileVersion: 3, packages: { '': { version }, 'node_modules/example': { version: '4.5.6' } } },
      null,
      2,
    ) + '\n',
  )
  git(local, 'add', 'package.json', 'package-lock.json')
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
    const released = git(local, 'rev-parse', 'HEAD')
    expect(git(remote, 'rev-parse', 'v1.2.3^{}')).toBe(released)
    expect(git(local, 'rev-parse', 'HEAD^')).toBe(commit)
    expect(git(local, 'log', '-1', '--format=%s')).toBe('chore(release): bump version to 1.2.3')
    expect(git(local, 'status', '--porcelain')).toBe('')
    expect(
      JSON.parse(readFileSync(join(local, 'package-lock.json'), 'utf8')).packages['node_modules/example'].version,
    ).toBe('4.5.6')
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

  it('retries failed validation without another bump or an early commit', () => {
    const { local, remote } = fixture()
    const original = git(local, 'rev-parse', 'HEAD')

    expect(() =>
      releaseTag(local, () => {
        throw new Error('check failed')
      }),
    ).toThrow('check failed')

    expect(git(local, 'rev-parse', 'HEAD')).toBe(original)
    expect(JSON.parse(readFileSync(join(local, 'package.json'), 'utf8')).version).toBe('1.2.3')
    expect(git(remote, 'for-each-ref')).toBe('')

    expect(releaseTag(local, () => {})).toBe('v1.2.3')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('2')
  })

  it.each(['minor', 'major'] as const)('supports an explicit %s release', (kind) => {
    const { local } = fixture()
    const version = kind === 'minor' ? '1.3.0' : '2.0.0'

    expect(releaseTag(local, () => {}, kind)).toBe(`v${version}`)
    expect(git(local, 'log', '-1', '--format=%s')).toBe(`chore(release): bump version to ${version}`)
  })

  it('refuses unrelated edits added to a pending version bump', () => {
    const { local } = fixture()
    expect(() =>
      releaseTag(local, () => {
        throw new Error('check failed')
      }),
    ).toThrow('check failed')
    const path = join(local, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.description = 'unrelated edit'
    writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')

    expect(() => releaseTag(local, () => {})).toThrow('local changes')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('1')
  })

  it('retries a rejected version commit without another bump', () => {
    const { local } = fixture()
    const hook = join(local, '.git', 'hooks', 'commit-msg')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })

    expect(() => releaseTag(local, () => {})).toThrow('commit')

    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('1')
    rmSync(hook)
    expect(releaseTag(local, () => {})).toBe('v1.2.3')
  })

  it('resumes a completed version commit after tag creation failed', () => {
    const { local } = fixture()
    git(local, 'config', 'tag.gpgSign', 'true')
    git(local, 'config', 'gpg.program', '/missing-release-gpg')

    expect(() => releaseTag(local, () => {})).toThrow('tag')

    expect(git(local, 'log', '-1', '--format=%s')).toBe('chore(release): bump version to 1.2.3')
    git(local, 'config', 'tag.gpgSign', 'false')
    expect(releaseTag(local, () => {})).toBe('v1.2.3')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('2')
  })

  it('bumps again only after a new application commit', () => {
    const { local } = fixture()
    releaseTag(local, () => {})

    expect(() => releaseTag(local, () => {})).toThrow('already exists locally')

    writeFileSync(join(local, 'application.txt'), 'next change')
    git(local, 'add', 'application.txt')
    git(local, 'commit', '--quiet', '-m', 'feat(app): add next change')

    expect(releaseTag(local, () => {})).toBe('v1.2.4')
    expect(git(local, 'log', '-1', '--format=%s')).toBe('chore(release): bump version to 1.2.4')
  })

  it('rejects a mismatched lockfile before editing files', () => {
    const { local } = fixture()
    const lockPath = join(local, 'package-lock.json')
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    lock.packages[''].version = '1.0.0'
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
    git(local, 'add', 'package-lock.json')
    git(local, 'commit', '--quiet', '-m', 'fixture lock mismatch')

    expect(() => releaseTag(local, () => {})).toThrow('versions must match')
    expect(git(local, 'status', '--porcelain')).toBe('')
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

  it.each(['v1.2.10', 'v1.3.0', 'v2.0.0', 'v1.2.4-beta.1', 'v1.2.3+build.2'])(
    'refuses candidate v1.2.3 when remote has %s before editing or checking',
    (remoteTag) => {
      const { local, remote } = fixture()
      git(local, 'push', '--quiet', remote, `HEAD:refs/tags/${remoteTag}`)
      const original = git(local, 'rev-parse', 'HEAD')

      expect(() =>
        releaseTag(local, () => {
          throw new Error('must not run')
        }),
      ).toThrow(`must be newer than remote release ${remoteTag}`)

      expect(git(local, 'rev-parse', 'HEAD')).toBe(original)
      expect(git(local, 'status', '--porcelain')).toBe('')
      expect(git(local, 'tag', '--list')).toBe('')
      expect(git(remote, 'rev-parse', remoteTag)).toBe(original)
    },
  )

  it('accepts a newer stable version with older, prerelease and unrelated remote tags', () => {
    const { local, remote } = fixture()
    for (const tag of ['v1.2.2', 'v1.2.3-rc.9', 'v1.2.3-rc.10+build.1', 'v0.99.99', 'v-next', 'v01.2.9']) {
      git(local, 'tag', '-a', tag, '-m', 'Remote release')
      git(local, 'push', '--quiet', remote, `refs/tags/${tag}`)
      git(local, 'tag', '-d', tag)
    }

    expect(releaseTag(local, () => {})).toBe('v1.2.3')
  })

  it.each([
    ['1.2.9', 'v1.2.3', 'v1.2.10'],
    ['9007199254740992.0.0', 'v9007199254740991.99.99', 'v9007199254740992.0.1'],
  ])('compares numeric version components for %s', (base, remoteTag, expected) => {
    const { local, remote } = fixture(base)
    git(local, 'push', '--quiet', remote, `HEAD:refs/tags/${remoteTag}`)

    expect(releaseTag(local, () => {})).toBe(expected)
  })

  it('rechecks after committing when a hook publishes a newer remote version', () => {
    const { local, remote } = fixture()
    writeFileSync(
      join(local, '.git', 'hooks', 'post-commit'),
      '#!/bin/sh\ngit push --quiet origin HEAD:refs/tags/v1.2.4\n',
      { mode: 0o755 },
    )

    expect(() => releaseTag(local, () => {})).toThrow('remote release v1.2.4')

    expect(git(local, 'log', '-1', '--format=%s')).toBe('chore(release): bump version to 1.2.3')
    expect(git(local, 'tag', '--list')).toBe('')
    expect(git(remote, 'for-each-ref', '--format=%(refname)')).toBe('refs/tags/v1.2.4')
  })

  it('checks version order at the configured push destination', () => {
    const { local, root } = fixture()
    const pushRemote = join(root, 'push.git')
    git(root, 'init', '--bare', '--quiet', pushRemote)
    git(local, 'push', '--quiet', pushRemote, 'HEAD:refs/tags/v9.0.0')
    git(local, 'remote', 'set-url', '--push', 'origin', pushRemote)

    expect(() => releaseTag(local, () => {})).toThrow('remote release v9.0.0')
    expect(git(local, 'status', '--porcelain')).toBe('')
  })

  it('rejects a newer remote version appearing during validation without committing', () => {
    const { local, remote } = fixture()
    const original = git(local, 'rev-parse', 'HEAD')
    let added = false

    expect(() =>
      releaseTag(local, () => {
        if (added) return
        added = true
        git(local, 'push', '--quiet', remote, 'HEAD:refs/tags/v1.2.4')
      }),
    ).toThrow('remote release v1.2.4')

    expect(git(local, 'rev-parse', 'HEAD')).toBe(original)
    expect(git(local, 'tag', '--list')).toBe('')
    expect(() => releaseTag(local, () => {})).toThrow('remote release v1.2.4')
    expect(JSON.parse(readFileSync(join(local, 'package.json'), 'utf8')).version).toBe('1.2.3')
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
    expect(() => releaseTag(local, () => {})).toThrow('already exists locally')
    expect(git(local, 'rev-list', '--count', 'HEAD')).toBe('2')
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
    expect(help.stdout).toContain('Usage: npm run release:electron')
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toContain('accepts only')
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
