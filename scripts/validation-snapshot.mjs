import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const GIT_OUTPUT_LIMIT = 100 * 1024 * 1024

function git(args, rootDirectory, encoding) {
  return execFileSync('git', args, { cwd: rootDirectory, encoding, maxBuffer: GIT_OUTPUT_LIMIT })
}

export function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

function addFramed(hash, label, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  hash.update(`${label}\0${bytes.length}\0`)
  hash.update(bytes)
  hash.update('\0')
}

export function createValidationSnapshot({ rootDirectory = ROOT, runGit = git } = {}) {
  const head = runGit(['rev-parse', 'HEAD'], rootDirectory, 'utf8').trim()
  const trackedDiff = runGit(['diff', '--binary', 'HEAD'], rootDirectory)
  const untrackedOutput = runGit(['ls-files', '--others', '--exclude-standard', '-z'], rootDirectory, 'utf8')
  const untrackedFiles = untrackedOutput
    .split('\0')
    .filter(Boolean)
    .filter((file) => file !== '.opencode/plan.md')
    .sort(comparePaths)
  const hash = createHash('sha256')
  addFramed(hash, 'head', head)
  addFramed(hash, 'tracked-diff', trackedDiff)
  for (const file of untrackedFiles) {
    addFramed(hash, 'untracked-path', file)
    const filePath = join(rootDirectory, file)
    if (lstatSync(filePath).isSymbolicLink()) {
      addFramed(hash, 'untracked-symlink-target', readlinkSync(filePath))
    } else {
      addFramed(hash, 'untracked-content', readFileSync(filePath))
    }
  }
  return { head, digest: `sha256:${hash.digest('hex')}`, untrackedFiles }
}

function main() {
  const snapshot = createValidationSnapshot()
  console.log(`HEAD: ${snapshot.head}`)
  console.log(`Snapshot: ${snapshot.digest}`)
  console.log(`Untracked files: ${snapshot.untrackedFiles.length}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
