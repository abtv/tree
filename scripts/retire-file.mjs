import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(args, rootDirectory) {
  return execFileSync('git', args, { cwd: rootDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// Decide whether one requested path may be retired, without changing anything. The guards keep the
// workflow to a single tracked regular file inside the repository: no directories, symlinks,
// option-like names, untracked files, or paths that escape the repository root.
export function resolveRetirement({ rootDirectory = ROOT, requestedPath, runGit = git, stat = lstatSync } = {}) {
  if (typeof requestedPath !== 'string' || requestedPath === '') {
    return { ok: false, reason: 'Expected exactly one repository-relative file path.' }
  }
  if (requestedPath.startsWith('-')) {
    return { ok: false, reason: `Refusing an option-like path: ${requestedPath}` }
  }
  if (isAbsolute(requestedPath)) {
    return { ok: false, reason: `Refusing an absolute path: ${requestedPath}` }
  }

  const absolutePath = resolve(rootDirectory, requestedPath)
  const relativePath = relative(rootDirectory, absolutePath)
  if (relativePath === '') {
    return { ok: false, reason: 'Refusing the repository root.' }
  }
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { ok: false, reason: `Refusing a path outside the repository: ${requestedPath}` }
  }

  let stats
  try {
    stats = stat(absolutePath)
  } catch {
    return { ok: false, reason: `Refusing a path that does not exist: ${relativePath}` }
  }
  if (stats.isSymbolicLink()) {
    return { ok: false, reason: `Refusing a symbolic link: ${relativePath}` }
  }
  if (!stats.isFile()) {
    return { ok: false, reason: `Refusing a path that is not a regular file: ${relativePath}` }
  }

  try {
    runGit(['ls-files', '--error-unmatch', '--', relativePath], rootDirectory)
  } catch {
    return { ok: false, reason: `Refusing an untracked path: ${relativePath}` }
  }

  return { ok: true, relativePath }
}

// Stage the deletion of one validated tracked file. A file with local modifications stays refused
// by git so uncommitted work is never retired silently.
export function retireFile({ rootDirectory = ROOT, requestedPath, runGit = git, stat = lstatSync } = {}) {
  const decision = resolveRetirement({ rootDirectory, requestedPath, runGit, stat })
  if (!decision.ok) return decision

  runGit(['rm', '--', decision.relativePath], rootDirectory)
  return decision
}

function main() {
  const arguments_ = process.argv.slice(2)
  const decision = retireFile({ requestedPath: arguments_.length === 1 ? arguments_[0] : undefined })

  if (!decision.ok) {
    console.error(`${decision.reason}\nUsage: npm run retire:file -- <repository-relative path>`)
    process.exitCode = 1
    return
  }

  console.log(`Retired ${decision.relativePath}: deletion staged.`)
  console.log(`Recover before committing with: git restore --staged --worktree ${decision.relativePath}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
