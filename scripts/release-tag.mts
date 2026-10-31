import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
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
  return result.stdout?.trim() ?? ''
}

/** The injected check runner is only for tests; the CLI always executes every check. */
export function releaseTag(
  cwd: string,
  runCheck: (args: readonly string[]) => void = (args) => run('npm', args, cwd, true),
): string {
  const git = (...args: string[]) => run('git', args, cwd)
  if (realpathSync(cwd) !== realpathSync(git('rev-parse', '--show-toplevel'))) {
    throw new Error('Run release:electron from the repository root')
  }
  const assertClean = () => {
    if (git('status', '--porcelain', '--untracked-files=all') !== '') {
      throw new Error('Commit or remove local changes before releasing')
    }
  }
  assertClean()
  const commit = git('rev-parse', '--verify', 'HEAD')
  const { version } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/.test(
      version,
    )
  ) {
    throw new Error('package.json must contain a valid semantic version')
  }
  const tag = `v${version}`
  const ref = `refs/tags/${tag}`
  git('check-ref-format', ref)
  const pushUrls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n')
  if (pushUrls.length !== 1 || !pushUrls[0]) throw new Error('origin must have exactly one push URL')
  const destination = pushUrls[0]
  const assertAbsent = () => {
    if (git('for-each-ref', '--format=%(refname)', ref).split('\n').includes(ref)) {
      throw new Error(`${tag} already exists locally; existing tags are never replaced`)
    }
    // Check the push destination, which may differ from origin's fetch URL.
    if (git('ls-remote', '--refs', '--tags', '--', destination, ref) !== '') {
      throw new Error(`${tag} already exists in origin; choose a new version`)
    }
  }
  assertAbsent()
  console.log(`Validating ${tag} at ${commit}`)
  for (const args of releaseChecks) runCheck(args)

  assertClean()
  if (git('rev-parse', '--verify', 'HEAD') !== commit) throw new Error('HEAD changed during validation; run again')
  if (git('remote', 'get-url', '--push', '--all', 'origin') !== destination) {
    throw new Error('origin changed during validation; run again')
  }
  assertAbsent()

  // Explicit SHA and no force: concurrent creation cannot replace an existing local tag.
  git('tag', '-a', tag, commit, '-m', `Release ${tag}`)
  const tagObject = git('rev-parse', '--verify', ref)
  if (git('rev-parse', '--verify', `${tagObject}^{commit}`) !== commit) {
    throw new Error('Local tag changed before push; inspect it without moving or deleting it')
  }
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
      'Usage: npm run release:electron\nValidate the clean current commit, then create and push its version tag to origin.',
    )
  } else if (args.length !== 0) {
    console.error(
      'release:electron accepts no arguments except --help; set the version in package.json and commit it first',
    )
    process.exitCode = 1
  } else {
    try {
      releaseTag(process.cwd())
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
