import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bumpVersion, type Bump } from './release-version.mts'

export function commitReleaseVersion(cwd: string, bump: Bump = 'patch') {
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
    return result.stdout.trim()
  }
  if (realpathSync(cwd) !== realpathSync(git('rev-parse', '--show-toplevel'))) {
    throw new Error('Run release:electron from the repository root')
  }
  if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Commit or remove local changes first')
  git('symbolic-ref', '--quiet', 'HEAD')
  const base = git('rev-parse', 'HEAD')
  const paths = ['package.json', 'package-lock.json']
  const original = paths.map((path) => readFileSync(join(cwd, path), 'utf8'))
  const candidate = bumpVersion(original, bump)
  paths.forEach((path, i) => writeFileSync(join(cwd, path), candidate.texts[i]!))
  if (git('rev-parse', 'HEAD') !== base) throw new Error('HEAD changed; inspect version edits before committing')
  git('add', '--', ...paths)
  if (
    git('diff', '--cached', '--name-only')
      .split('\n')
      .some((path) => !paths.includes(path)) ||
    paths.some((path, i) => readFileSync(join(cwd, path), 'utf8') !== candidate.texts[i])
  ) {
    throw new Error('Repository changed while preparing the version commit; inspect staged changes')
  }
  // A rejected hook/signature leaves the candidate staged for an ordinary commit;
  // the next invocation refuses the dirty tree instead of bumping a second time.
  git('commit', '-m', `chore(release): bump version to ${candidate.version}`)
  if (git('rev-parse', 'HEAD^') !== base || git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('Repository changed while committing; inspect the release commit')
  }
  console.log(`Committed version ${candidate.version}. Push or merge this commit to main to prepare a release draft.`)
  return candidate.version
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: npm run release:electron [-- patch|minor|major]\nBump patch by default and commit locally. No tests, network access, tags or publishing.',
    )
  } else if (args.length > 1 || (args.length === 1 && !['patch', 'minor', 'major'].includes(args[0]!))) {
    console.error('release:electron accepts only patch, minor, major, or --help')
    process.exitCode = 1
  } else {
    try {
      commitReleaseVersion(process.cwd(), args[0] as Bump | undefined)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
