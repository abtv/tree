import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_DAYS = 14
export const SIGNAL_THRESHOLD = 3

const GIT_OUTPUT_LIMIT = 100 * 1024 * 1024
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

function git(args, rootDirectory) {
  return execFileSync('git', args, { cwd: rootDirectory, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT })
}

// A "fix" subject is the Conventional Commit form or the capitalized imperative form the policy
// names. "fixes" and "docs: fix ..." are not defects in the code itself, so they stay out.
export function isFixSubject(subject) {
  return subject.startsWith('fix(') || subject.startsWith('fix:') || subject.startsWith('Fix ')
}

// The default file set comes from a fix commit or a dirty tree; tests, documentation, and the
// end-to-end suite are dropped because the signal concerns production code.
export function isExcludedFromDefault(path) {
  if (path.startsWith('e2e/')) return true
  if (path.endsWith('.md')) return true
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
}

function splitFlag(argument) {
  const separator = argument.indexOf('=')
  if (separator === -1) return [argument, undefined]
  return [argument.slice(0, separator), argument.slice(separator + 1)]
}

export function parseArguments(argv) {
  const options = { days: DEFAULT_DAYS, since: undefined, until: undefined, paths: [] }
  let afterSeparator = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (afterSeparator) {
      options.paths.push(argument)
      continue
    }
    if (argument === '--') {
      afterSeparator = true
      continue
    }
    if (argument.startsWith('--')) {
      const [flag, inlineValue] = splitFlag(argument)
      if (flag !== '--days' && flag !== '--since' && flag !== '--until') {
        throw new Error(`unknown option ${argument}`)
      }
      const value = inlineValue ?? argv[++index]
      if (value === undefined) throw new Error(`${flag} requires a value`)
      if (flag === '--days') {
        const days = Number(value)
        if (!Number.isInteger(days) || days <= 0) throw new Error('--days requires a positive integer')
        options.days = days
      } else if (flag === '--since') {
        options.since = value
      } else {
        options.until = value
      }
      continue
    }
    options.paths.push(argument)
  }

  return options
}

function headState(rootDirectory) {
  const hash = git(['rev-parse', 'HEAD'], rootDirectory).trim()
  const subject = git(['log', '-1', '--pretty=%s', 'HEAD'], rootDirectory).trim()
  return { hash, subject, isFix: isFixSubject(subject) }
}

function defaultPaths(rootDirectory, headIsFix) {
  const listCommand = headIsFix ? ['show', '--pretty=format:', '--name-only', 'HEAD'] : ['diff', '--name-only', 'HEAD']
  return git(listCommand, rootDirectory)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => !isExcludedFromDefault(path))
}

export function fixCommitsForPath(rootDirectory, path, { since, until } = {}) {
  const args = ['log', '--no-merges', '--date=short', '--format=%H%x09%h%x09%ad%x09%s']
  if (since !== undefined) args.push(`--since=${since}`)
  if (until !== undefined) args.push(`--until=${until}`)
  args.push('--', path)

  let output
  try {
    output = git(args, rootDirectory)
  } catch {
    return []
  }

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [fullHash, hash, date, ...subjectParts] = line.split('\t')
      return { fullHash, hash, date, subject: subjectParts.join('\t') }
    })
    .filter((commit) => isFixSubject(commit.subject))
}

export function collectFixHistory({
  rootDirectory = ROOT,
  paths = [],
  days = DEFAULT_DAYS,
  since,
  until,
  now = new Date(),
} = {}) {
  const head = headState(rootDirectory)
  const defaulted = paths.length === 0
  const selected = defaulted ? defaultPaths(rootDirectory, head.isFix) : [...paths]
  const effectiveSince = since ?? new Date(now.getTime() - days * MILLISECONDS_PER_DAY).toISOString()
  const label =
    since === undefined && until === undefined
      ? `the last ${days} days`
      : `${effectiveSince.slice(0, 10)} to ${until === undefined ? 'now' : until.slice(0, 10)}`

  const files = selected.map((path) => ({
    path,
    commits: fixCommitsForPath(rootDirectory, path, { since: effectiveSince, until }).filter(
      (commit) => commit.fullHash !== head.hash,
    ),
  }))
  const signalFiles = files.filter((file) => file.commits.length >= SIGNAL_THRESHOLD).map((file) => file.path)

  return { head, defaulted, label, since: effectiveSince, until, files, signalFiles }
}

export function formatReport(report) {
  const lines = [`Fix history for ${report.label}${report.defaulted ? ' (default files)' : ''}`]
  for (const file of report.files) {
    lines.push(file.path)
    if (file.commits.length === 0) {
      lines.push('  no fix commits in window')
      continue
    }
    for (const commit of file.commits) {
      lines.push(`  ${commit.hash} ${commit.date} ${commit.subject}`)
    }
  }
  if (report.signalFiles.length > 0) {
    lines.push('')
    lines.push(
      `Possible shared design cause: ${report.signalFiles.join(', ')} each have ${SIGNAL_THRESHOLD} or more fix commits in the window. Consider a structural initiative under AGENTS.md §8, or state why none is needed.`,
    )
  }
  return lines.join('\n')
}

function main(argv) {
  let options
  try {
    options = parseArguments(argv)
  } catch (error) {
    console.log(`fix:history: ${error.message}`)
    return
  }
  console.log(formatReport(collectFixHistory(options)))
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
