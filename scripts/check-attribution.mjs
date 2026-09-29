import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Mirrors the patterns in .githooks/commit-msg. That hook only ever sees a commit message on the
// machine that made the commit; this script is the repository-level backstop for a pull request
// description (which no git hook can see) and for commits made without the hook installed.
const AGENT_NAME_PATTERN = /(claude|anthropic|codex|openai|chatgpt|gpt-[0-9]|copilot|opencode|gemini)/i
const CO_AUTHOR_LINE = /^co-authored-by:/i
const GENERATED_LINE = /generated (with|by)/i

export function findAttributionLine(text) {
  if (text === undefined || text === null) return undefined
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    if ((CO_AUTHOR_LINE.test(line) || GENERATED_LINE.test(line)) && AGENT_NAME_PATTERN.test(line)) return line
  }
  return undefined
}

function git(args, rootDirectory) {
  const result = spawnSync('git', args, { cwd: rootDirectory, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x01'

export function collectCommitMessages({ rootDirectory = ROOT, baseSha, headSha, runGit = git } = {}) {
  if (baseSha === undefined || headSha === undefined || baseSha === '' || headSha === '') return []
  const output = runGit(
    ['log', '--reverse', `--format=%H${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`, `${baseSha}..${headSha}`],
    rootDirectory,
  )
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [hash, ...rest] = record.split(FIELD_SEPARATOR)
      return { hash, message: rest.join(FIELD_SEPARATOR) }
    })
}

export function checkAttribution({ prBody, commitMessages }) {
  const violations = []
  const prMatch = findAttributionLine(prBody)
  if (prMatch !== undefined) {
    violations.push({ source: 'pull request description', line: prMatch })
  }
  for (const { hash, message } of commitMessages) {
    const match = findAttributionLine(message)
    if (match !== undefined) {
      violations.push({ source: `commit ${hash.slice(0, 7)}`, line: match })
    }
  }
  return violations
}

function main() {
  const commitMessages = collectCommitMessages({ baseSha: process.env.BASE_SHA, headSha: process.env.HEAD_SHA })
  const violations = checkAttribution({ prBody: process.env.PR_BODY, commitMessages })

  if (violations.length === 0) {
    console.log('No agent attribution found in the pull request description or its commits.')
    process.exitCode = 0
    return
  }

  console.error('Agent attribution is not allowed (AGENTS.md §12):')
  for (const violation of violations) {
    console.error(`  - ${violation.source}: "${violation.line}"`)
  }
  process.exitCode = 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
