import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function nulSeparated(output: string) {
  return output.split('\0').filter(Boolean)
}

function git(args: string[], rootDirectory: string) {
  const result = spawnSync('git', args, { cwd: rootDirectory, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

export function comparePaths(left: string, right: string) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

export function collectChangedFiles({ rootDirectory = ROOT, runGit = git } = {}) {
  const tracked = nulSeparated(runGit(['diff', '--name-only', '--diff-filter=ACMRTUXB', '-z', 'HEAD'], rootDirectory))
  const untracked = nulSeparated(runGit(['ls-files', '--others', '--exclude-standard', '-z'], rootDirectory))
  return [...new Set([...tracked, ...untracked])].sort(comparePaths)
}

export function prettierArguments(files: string[]) {
  return ['--check', '--ignore-unknown', '--', ...files]
}

export function runFormatCheck({
  rootDirectory = ROOT,
  files = collectChangedFiles({ rootDirectory }),
  runProcess = spawnSync,
}: {
  rootDirectory?: string
  files?: string[]
  runProcess?: (
    command: string,
    args: string[],
    options: import('node:child_process').SpawnSyncOptions,
  ) => { status: number | null; error?: Error }
} = {}) {
  if (files.length === 0) {
    console.log('No changed files are eligible for formatting.')
    return 0
  }
  const prettier = resolve(rootDirectory, 'node_modules', 'prettier', 'bin', 'prettier.cjs')
  const result = runProcess(process.execPath, [prettier, ...prettierArguments(files)], {
    cwd: rootDirectory,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function main() {
  process.exitCode = runFormatCheck()
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
