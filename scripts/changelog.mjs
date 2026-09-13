import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

const CONVENTIONAL_COMMIT = /^([a-z]+)(\([^)]*\))?!?:\s*(.+)$/

const TYPE_SECTIONS = {
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Performance',
  refactor: 'Changed',
  docs: 'Documentation',
  test: 'Tests',
  build: 'Build and CI',
  ci: 'Build and CI',
  chore: 'Chores',
  revert: 'Reverted',
}

const SECTION_ORDER = [
  'Added',
  'Fixed',
  'Performance',
  'Changed',
  'Documentation',
  'Tests',
  'Build and CI',
  'Chores',
  'Reverted',
]

const HEADER =
  '# Changelog\n\nThis changelog is generated from Conventional Commit history. Regenerate it with `npm run changelog`. Commits made before the convention was adopted are not itemized.\n\n## Unreleased\n'

export function parseConventionalCommit(subject) {
  const match = CONVENTIONAL_COMMIT.exec(subject.trim())
  if (!match) return undefined
  const section = TYPE_SECTIONS[match[1]]
  if (section === undefined) return undefined
  return { type: match[1], scope: match[2] ?? '', section, subject: match[3].trim() }
}

export function generateChangelog(commits) {
  const sections = new Map()
  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit.subject)
    if (parsed === undefined) continue
    if (!sections.has(parsed.section)) sections.set(parsed.section, [])
    sections.get(parsed.section).push(`- ${parsed.subject} (\`${commit.hash}\`)`)
  }
  const blocks = []
  for (const name of SECTION_ORDER) {
    const entries = sections.get(name)
    if (entries === undefined || entries.length === 0) continue
    blocks.push(`### ${name}\n\n${entries.join('\n')}`)
  }
  if (blocks.length === 0) return `${HEADER}\nNo conventional commits recorded yet.\n`
  return `${HEADER}\n${blocks.join('\n\n')}\n`
}

function readCommits(since) {
  const args = ['log', '--no-merges', '--pretty=format:%h%x09%s']
  if (since !== undefined) args.push(`${since}..HEAD`)
  const output = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [hash, ...rest] = line.split('\t')
      return { hash, subject: rest.join('\t') }
    })
}

function main() {
  const sinceIndex = process.argv.indexOf('--since')
  const since = sinceIndex === -1 ? undefined : process.argv[sinceIndex + 1]
  const changelog = generateChangelog(readCommits(since))
  if (process.argv.includes('--write')) {
    writeFileSync(resolve(ROOT, 'CHANGELOG.md'), changelog)
    console.log('Wrote CHANGELOG.md.')
    return
  }
  process.stdout.write(changelog)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
