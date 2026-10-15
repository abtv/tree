import { lstatSync, realpathSync, rmSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// List task directories here when their evidence must survive ordinary scratch cleanup.
export const RETAINED_TASKS = Object.freeze([])

// Decide whether one task scratch directory may be removed, without changing anything. The guards
// keep the workflow to a single real directory directly under `.scratch/`: no nested or option-like
// names, symlinks, retained initiative evidence, or locations that resolve elsewhere.
export function resolveScratchRetirement({ rootDirectory = ROOT, taskName, stat = lstatSync } = {}) {
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

// Remove one validated task directory. Recursive removal unlinks nested symlinks rather than
// following them, so content outside the directory is never deleted.
export function retireScratch({ rootDirectory = ROOT, taskName, stat = lstatSync, remove = rmSync } = {}) {
  const decision = resolveScratchRetirement({ rootDirectory, taskName, stat })
  if (!decision.ok) return decision

  remove(resolve(rootDirectory, decision.relativePath), { recursive: true })
  return decision
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
