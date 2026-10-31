import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const releaseChecks = [
  ['run', 'check'],
  ['run', 'test:performance'],
  ['run', 'test:perf', '--', '--project=electron'],
] as const

function run(command: string, args: readonly string[], cwd: string, inherit = false): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed${result.signal ? ` (${result.signal})` : ''}`)
  }
  return result.stdout ?? ''
}

type Bump = 'patch' | 'minor' | 'major'
const versionPaths = ['package.json', 'package-lock.json'] as const

function parseVersion(version: string) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/.exec(
      version,
    )
  if (!match) return undefined
  return { core: match.slice(1, 4).map((part) => BigInt(part)), prerelease: match[4] }
}

/** Candidates produced by this command are stable; build metadata has no precedence. */
function atLeastCandidate(remote: NonNullable<ReturnType<typeof parseVersion>>, candidate: bigint[]) {
  for (let index = 0; index < 3; index++) {
    if (remote.core[index] !== candidate[index]) return remote.core[index]! > candidate[index]!
  }
  return remote.prerelease === undefined
}

function versionFiles(texts: string[], bump: Bump) {
  const manifest = JSON.parse(texts[0]!) as { version: string }
  const lock = JSON.parse(texts[1]!) as { version: string; packages: Record<string, { version: string }> }
  const parsed = parseVersion(manifest.version)
  if (!parsed) {
    throw new Error('package.json must contain a valid semantic version')
  }
  if (lock.version !== manifest.version || lock.packages['']?.version !== manifest.version) {
    throw new Error('Package and lockfile versions must match')
  }
  const [major, minor, patch] = parsed.core as [bigint, bigint, bigint]
  const version =
    bump === 'major'
      ? `${major + 1n}.0.0`
      : bump === 'minor'
        ? `${major}.${minor + 1n}.0`
        : `${major}.${minor}.${patch + 1n}`
  manifest.version = lock.version = lock.packages['']!.version = version
  return { version, texts: [manifest, lock].map((file) => JSON.stringify(file, null, 2) + '\n') }
}

/** The injected check runner is only for tests; the CLI always executes every check. */
export function releaseTag(
  cwd: string,
  runCheck: (args: readonly string[]) => void = (args) => run('npm', args, cwd, true),
  bump: Bump = 'patch',
): string {
  const git = (...args: string[]) => run('git', args, cwd).trim()
  if (realpathSync(cwd) !== realpathSync(git('rev-parse', '--show-toplevel'))) {
    throw new Error('Run release:electron from the repository root')
  }
  const assertClean = () => {
    if (git('status', '--porcelain', '--untracked-files=all') !== '') {
      throw new Error('Commit or remove local changes before releasing')
    }
  }
  let commit = git('rev-parse', '--verify', 'HEAD')
  const committedTexts = versionPaths.map((path) => run('git', ['show', `${commit}:${path}`], cwd))
  let candidate = versionFiles(committedTexts, bump)
  // A failed commit/tag step can leave the completed version commit at HEAD.
  const currentVersion = (JSON.parse(committedTexts[0]!) as { version: string }).version
  let alreadyCommitted = false
  if (git('log', '-1', '--format=%s') === `chore(release): bump version to ${currentVersion}`) {
    const parent = git('rev-parse', `${commit}^`)
    const previous = versionPaths.map((path) => run('git', ['show', `${parent}:${path}`], cwd))
    const matches = (['patch', 'minor', 'major'] as const).some((kind) => {
      const expected = versionFiles(previous, kind)
      return expected.texts.every((text, index) => text === committedTexts[index])
    })
    const changed = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).split('\n')
    if (matches && changed.every((path) => versionPaths.includes(path as (typeof versionPaths)[number]))) {
      candidate = { version: currentVersion, texts: committedTexts }
      alreadyCommitted = true
    }
  }
  const assertCandidate = () => {
    const changes = run('git', ['status', '--porcelain', '-z', '--untracked-files=all'], cwd)
      .split('\0')
      .filter(Boolean)
    if (changes.some((entry) => !versionPaths.includes(entry.slice(3) as (typeof versionPaths)[number]))) {
      throw new Error('Commit or remove local changes before releasing')
    }
    versionPaths.forEach((path, index) => {
      if (readFileSync(join(cwd, path), 'utf8') !== candidate.texts[index]) {
        throw new Error('Unexpected local changes in version files; inspect them before releasing')
      }
    })
    const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean)
    staged.forEach((path) => {
      const index = versionPaths.indexOf(path as (typeof versionPaths)[number])
      if (index < 0 || run('git', ['show', `:${path}`], cwd) !== candidate.texts[index]) {
        throw new Error('Unexpected staged local changes before releasing')
      }
    })
  }
  const clean = git('status', '--porcelain', '--untracked-files=all') === ''
  if (!clean) assertCandidate()
  const { version } = candidate
  const tag = `v${version}`
  const ref = `refs/tags/${tag}`
  git('check-ref-format', ref)
  const pushUrls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n')
  if (pushUrls.length !== 1 || !pushUrls[0]) throw new Error('origin must have exactly one push URL')
  const destination = pushUrls[0]
  const assertRemoteVersion = () => {
    // The push destination may differ from origin's fetch URL. Read every release
    // tag afresh, including tags for drafts and tags missing from the local clone.
    const tags = git('ls-remote', '--refs', '--tags', '--', destination, 'refs/tags/v*')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')[1]!)
    if (tags.includes(ref)) throw new Error(`${tag} already exists in origin; choose a new version`)
    const candidateCore = parseVersion(version)!.core
    for (const remoteRef of tags) {
      const remoteTag = remoteRef.slice('refs/tags/'.length)
      const remoteVersion = parseVersion(remoteTag.slice(1))
      if (remoteVersion && atLeastCandidate(remoteVersion, candidateCore)) {
        throw new Error(`${tag} must be newer than remote release ${remoteTag}; update your checkout before releasing`)
      }
    }
  }
  const assertAbsent = () => {
    if (git('for-each-ref', '--format=%(refname)', ref).split('\n').includes(ref)) {
      throw new Error(`${tag} already exists locally; existing tags are never replaced`)
    }
    assertRemoteVersion()
  }
  assertAbsent()
  if (clean && !alreadyCommitted) {
    versionPaths.forEach((path, index) => writeFileSync(join(cwd, path), candidate.texts[index]!))
  }
  assertCandidate()
  console.log(`Validating ${tag} at ${commit}`)
  for (const args of releaseChecks) runCheck(args)

  assertCandidate()
  if (git('rev-parse', '--verify', 'HEAD') !== commit) throw new Error('HEAD changed during validation; run again')
  if (git('remote', 'get-url', '--push', '--all', 'origin') !== destination) {
    throw new Error('origin changed during validation; run again')
  }
  assertAbsent()

  if (!alreadyCommitted) {
    git('add', '--', ...versionPaths)
    git('commit', '-m', `chore(release): bump version to ${version}`)
    const releasedCommit = git('rev-parse', 'HEAD')
    if (git('rev-parse', `${releasedCommit}^`) !== commit) throw new Error('HEAD changed while committing')
    commit = releasedCommit
  }
  if (
    git('diff', '--name-only', `${commit}^`, commit)
      .split('\n')
      .some((path) => !versionPaths.includes(path as (typeof versionPaths)[number]))
  ) {
    throw new Error('Release commit contains unexpected changes; inspect it before tagging')
  }
  assertClean()
  assertCandidate()
  if (git('remote', 'get-url', '--push', '--all', 'origin') !== destination)
    throw new Error('origin changed while committing')
  assertAbsent()

  // Explicit SHA and no force: concurrent creation cannot replace an existing local tag.
  git('tag', '-a', tag, commit, '-m', `Release ${tag}`)
  const tagObject = git('rev-parse', '--verify', ref)
  if (git('rev-parse', '--verify', `${tagObject}^{commit}`) !== commit) {
    throw new Error('Local tag changed before push; inspect it without moving or deleting it')
  }
  assertRemoteVersion()
  try {
    // Pin the source object too: a concurrent local tag move cannot publish an untested commit.
    // An explicit destination avoids mirror/push/followTags configuration and publishes no branch.
    run('git', ['push', '--no-force', '--no-follow-tags', '--', destination, `${tagObject}:${ref}`], cwd, true)
  } catch {
    throw new Error(
      `Push failed. Local tag ${tag} was retained at ${tagObject}. No tag was deleted or force-updated. ` +
        'Check the remote result and local tag before retrying; do not move or recreate the tag.',
    )
  }
  console.log(`Pushed ${tag} at ${commit}. GitHub Actions will prepare the release draft.`)
  return tag
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: npm run release:electron [-- patch|minor|major]\nBump patch by default, validate, commit the version, then create and push its tag. Retry failed checks with the same command.',
    )
  } else if (args.length > 1 || (args.length === 1 && !['patch', 'minor', 'major'].includes(args[0]!))) {
    console.error('release:electron accepts only patch, minor, major, or --help')
    process.exitCode = 1
  } else {
    try {
      releaseTag(process.cwd(), undefined, args[0] as Bump | undefined)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
