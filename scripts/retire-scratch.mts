import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// List task directories here when their evidence must survive ordinary scratch cleanup.
export const RETAINED_TASKS = Object.freeze<string[]>([])

// Decide whether one task scratch directory may be removed, without changing anything. The guards
// keep the workflow to a single real directory directly under `.scratch/`: no nested or option-like
// names, symlinks, retained initiative evidence, or locations that resolve elsewhere.
type Retirement = { ok: true; relativePath: string } | { ok: false; reason: string }
interface RetirementOptions {
  rootDirectory?: string
  taskName?: string | undefined
  stat?: (path: string) => Pick<import('node:fs').Stats, 'isSymbolicLink' | 'isDirectory'>
  remove?: typeof rmSync
}
interface Repository {
  path: string
  standalone: boolean
  bare?: boolean
}

export function resolveScratchRetirement({
  rootDirectory = ROOT,
  taskName,
  stat = lstatSync,
}: RetirementOptions = {}): Retirement {
  if (typeof taskName !== 'string' || taskName === '') {
    return { ok: false, reason: 'Expected exactly one scratch task name.' }
  }
  if (taskName.startsWith('-')) {
    return { ok: false, reason: `Refusing an option-like task name: ${taskName}` }
  }
  if (taskName === '.' || taskName === '..' || taskName.includes('/') || taskName.includes('\\')) {
    return { ok: false, reason: `Refusing a task name that is not one directory name: ${taskName}` }
  }
  if (RETAINED_TASKS.includes(taskName)) {
    return { ok: false, reason: `Refusing retained initiative evidence: .scratch/${taskName}` }
  }

  const scratchDirectory = resolve(rootDirectory, '.scratch')
  const absolutePath = resolve(scratchDirectory, taskName)
  const relativePath = relative(rootDirectory, absolutePath)

  let stats
  try {
    stats = stat(absolutePath)
  } catch {
    return { ok: false, reason: `Refusing a path that does not exist: ${relativePath}` }
  }
  if (stats.isSymbolicLink()) {
    return { ok: false, reason: `Refusing a symbolic link: ${relativePath}` }
  }
  if (!stats.isDirectory()) {
    return { ok: false, reason: `Refusing a path that is not a directory: ${relativePath}` }
  }

  // A `.scratch` directory replaced by a symlink would make the textual path above point outside
  // the repository, so require the canonical location to stay directly under the real `.scratch`.
  let realRoot
  let realPath
  try {
    realRoot = realpathSync(rootDirectory)
    realPath = realpathSync(absolutePath)
  } catch {
    return { ok: false, reason: `Refusing a path that does not exist: ${relativePath}` }
  }
  if (relative(resolve(realRoot, '.scratch'), realPath) !== taskName) {
    return { ok: false, reason: `Refusing a path whose real location is outside .scratch: ${relativePath}` }
  }

  return { ok: true, relativePath }
}

function git(directory: string, ...args: string[]) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', directory, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  })
}

function worktrees(directory: string) {
  return git(directory, 'worktree', 'list', '--porcelain', '-z')
    .split('\0\0')
    .filter(Boolean)
    .map((record) => {
      const fields = record.split('\0')
      return {
        path: fields.find((field) => field.startsWith('worktree '))!.slice('worktree '.length),
        locked: fields.some((field) => field === 'locked' || field.startsWith('locked ')),
      }
    })
}

function inside(parent: string, path: string) {
  const child = relative(parent, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

function assertClean(directory: string) {
  if (git(directory, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none') !== '') {
    throw new Error(`Refusing checkout with uncommitted changes: ${directory}`)
  }
}

// Never follow nested links, including a symlink used as Git metadata. Inspect embedded clones as
// well as linked worktrees so recursive scratch cleanup cannot erase unfinished repository edits.
function repositories(directory: string, found: Repository[] = []): Repository[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  const metadata = entries.find((entry) => entry.name === '.git')
  if (metadata) {
    if (metadata.isSymbolicLink()) throw new Error(`Refusing symlinked Git metadata: ${directory}`)
    found.push({ path: directory, standalone: metadata.isDirectory() })
  } else if (['HEAD', 'objects', 'refs'].every((name) => entries.some((entry) => entry.name === name))) {
    // Bare clones have no .git entry, but their metadata may still own an outside worktree.
    if (git(directory, 'rev-parse', '--is-bare-repository').trim() !== 'true') {
      throw new Error(`Refusing unrecognized Git metadata: ${directory}`)
    }
    found.push({ path: directory, standalone: true, bare: true })
    return found
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.git') repositories(resolve(directory, entry.name), found)
  }
  return found
}

function prepareWorktrees(root: string, task: string) {
  const found = repositories(task)
  // Plain scratch fixtures need no Git repository. In the real project also inspect registrations
  // whose checkout disappeared during a previous interrupted cleanup.
  const hasRootGit = existsSync(resolve(root, '.git'))
  const registered = hasRootGit ? worktrees(root) : []
  const common = hasRootGit ? realpathSync(resolve(root, git(root, 'rev-parse', '--git-common-dir').trim())) : undefined
  const selected = registered.filter((entry) => inside(task, entry.path))

  for (const entry of selected) {
    if (entry.locked) throw new Error(`Refusing locked worktree: ${entry.path}`)
    // Check every existing path component; a missing checkout is safe to unregister, while a
    // symlinked parent could make Git delete a checkout outside the selected task directory.
    let current = task
    for (const component of relative(task, entry.path).split(sep).filter(Boolean)) {
      current = resolve(current, component)
      let stats
      try {
        stats = lstatSync(current)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
        throw error
      }
      if (stats.isSymbolicLink()) throw new Error(`Refusing symlinked worktree path: ${current}`)
    }
  }

  for (const repository of found) {
    if (!repository.bare) {
      const top = realpathSync(git(repository.path, 'rev-parse', '--show-toplevel').trim())
      if (top !== repository.path) throw new Error(`Refusing mismatched Git checkout: ${repository.path}`)
      assertClean(repository.path)
    }
    if (repository.standalone) {
      const linked = worktrees(repository.path)
      if (linked.length !== 1 || linked[0]!.path !== repository.path || linked[0]!.locked) {
        throw new Error(`Refusing embedded repository with linked worktrees: ${repository.path}`)
      }
    } else {
      const owner = realpathSync(resolve(repository.path, git(repository.path, 'rev-parse', '--git-common-dir').trim()))
      if (owner !== common || !selected.some((entry) => entry.path === repository.path)) {
        throw new Error(`Refusing worktree not owned by this repository: ${repository.path}`)
      }
    }
  }
  for (const entry of selected) {
    if (existsSync(entry.path) && !found.some((repository) => repository.path === entry.path)) {
      throw new Error(`Refusing worktree with missing Git metadata: ${entry.path}`)
    }
  }
  return selected.sort((a, b) => b.path.length - a.path.length)
}

// Preflight every checkout before any deletion. Remove children first through Git to retire only
// their registrations; leave unrelated worktrees and branches alone. Ignored build output is
// disposable, but tracked changes, staged changes, untracked files and locks are not.
export function retireScratch({
  rootDirectory = ROOT,
  taskName,
  stat = lstatSync,
  remove = rmSync,
}: RetirementOptions = {}): Retirement {
  const decision = resolveScratchRetirement({ rootDirectory, taskName, stat })
  if (!decision.ok) return decision

  try {
    const root = realpathSync(rootDirectory)
    const task = resolve(root, decision.relativePath)
    const selected = prepareWorktrees(root, task)
    for (const entry of selected) {
      if (existsSync(entry.path)) assertClean(entry.path)
      // A single --force permits ignored build output; Git still refuses a newly locked worktree.
      git(root, 'worktree', 'remove', '--force', '--', entry.path)
    }
    if (existsSync(task)) remove(task, { recursive: true })
    return decision
  } catch (error) {
    return {
      ok: false,
      reason: `Scratch retirement stopped: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function main() {
  const arguments_ = process.argv.slice(2)
  const decision = retireScratch({ taskName: arguments_.length === 1 ? arguments_[0] : undefined })

  if (!decision.ok) {
    console.error(`${decision.reason}\nUsage: npm run retire:scratch -- <task>`)
    process.exitCode = 1
    return
  }

  console.log(`Removed ${decision.relativePath}.`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
