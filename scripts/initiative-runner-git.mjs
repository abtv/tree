import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { join, posix } from 'node:path'
import { createValidationSnapshot } from './validation-snapshot.mjs'

export function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export function repositoryPath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('-') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.split('/').some((part) => part === '..' || part === '.' || part === '') ||
    posix.isAbsolute(value)
  ) {
    throw new Error('Expected a normalized repository-relative path')
  }
  return value
}

function command(root, args, encoding = 'utf8') {
  return execFileSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    encoding,
    maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
}

function entries(output, index) {
  return output
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t')
      if (tab < 0) throw new Error('Malformed Git manifest')
      const [mode, middle, last] = line.slice(0, tab).split(' ')
      return { path: line.slice(tab + 1), mode, blob: index ? middle : last, stage: index ? last : '0' }
    })
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
}

function identity(manifest) {
  return digest(manifest.map(({ path, mode, blob }) => [path, mode, blob]))
}

export function taskStatus(plan, taskId) {
  const rows = plan.split('\n').filter((line) => line.startsWith('|'))
  const matches = rows.map((line) => line.split('|').map((cell) => cell.trim())).filter((cells) => cells[1] === taskId)
  if (matches.length !== 1) return null
  return matches[0].at(-2)
}

// Read-only observations. Never stages, commits, cleans, or rewrites the worktree.
export function observeRepository({ root, startingCommit, planPath, taskId }) {
  root = realpathSync(root)
  repositoryPath(planPath)
  if (!/^[a-f0-9]{40,64}$/.test(startingCommit)) throw new Error('Expected a full starting commit ID')
  if (!/^[A-Z][A-Z0-9]*-[0-9]+$/.test(taskId)) throw new Error('Invalid task ID')
  if (realpathSync(command(root, ['rev-parse', '--show-toplevel']).trim()) !== root) {
    throw new Error('Run from the repository root')
  }
  command(root, ['cat-file', '-e', `${startingCommit}^{commit}`])
  const head = command(root, ['rev-parse', 'HEAD']).trim()
  const parents = command(root, ['rev-list', '--parents', '-n', '1', head]).trim().split(' ').slice(1)
  const index = entries(command(root, ['ls-files', '--stage', '-z']), true)
  const tree = entries(command(root, ['ls-tree', '-r', '-z', head]), false)
  const conflicts = index.filter((entry) => entry.stage !== '0').map((entry) => entry.path)
  const unsupported = index
    .filter((entry) => !['100644', '100755', '120000'].includes(entry.mode))
    .map((entry) => entry.path)
  const unstaged = command(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z'])
    .split('\0')
    .filter(Boolean)
  const untracked = command(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
  const changed = command(root, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--cached',
    '--name-only',
    '-z',
    startingCommit,
  ])
    .split('\0')
    .filter(Boolean)
  const planEntry = index.find((entry) => entry.path === planPath && entry.stage === '0')
  // Read the indexed blob rather than following a worktree symlink.
  const plan =
    planEntry && ['100644', '100755'].includes(planEntry.mode)
      ? command(root, ['cat-file', 'blob', planEntry.blob])
      : ''
  const snapshot = createValidationSnapshot({
    rootDirectory: root,
    runGit: (args, directory, encoding) =>
      command(directory, args[0] === 'diff' ? [...args, '--no-ext-diff', '--no-textconv'] : args, encoding),
  })
  return {
    root,
    startingCommit,
    planPath,
    taskId,
    head,
    parents,
    indexIdentity: identity(index),
    headIdentity: identity(tree),
    snapshot: snapshot.digest,
    conflicts,
    unsupported,
    unstaged,
    untracked,
    changed,
    planBlob: planEntry?.blob ?? null,
    planStatus: taskStatus(plan, taskId),
    workingPlanPresent: existsSync(join(root, 'WORKING_PLAN.md')),
  }
}
