import { execFileSync } from 'node:child_process'

type Commit = { subject: string; body?: string }
type Lock = { packages: Record<string, { version?: string; dependencies?: Record<string, string> }> }
const sections = ['Breaking changes', 'Added', 'Improved', 'Fixed', 'Dependencies']
const internal =
  /^(?:ci|build|release|web-release|memory|tests?|smoke|e2e|perf-tests|tooling|docs|agents|security-audit)$/i

export function formatReleaseNotes(commits: Commit[], before: Lock | undefined, after: Lock, link: string) {
  const entries = new Map(sections.map((name) => [name, new Set<string>()]))
  for (const { subject, body = '' } of commits) {
    const match = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject)
    if (!match) continue
    const [, type, scope = '', breaking, text] = match
    const warning = /^BREAKING[ -]CHANGE:\s*(.+)$/m.exec(body)?.[1]
    if (breaking || warning) entries.get('Breaking changes')!.add(warning ?? text!)
    else if (!internal.test(scope)) {
      const section = { feat: 'Added', fix: 'Fixed', perf: 'Improved' }[type!]
      if (section) entries.get(section)!.add(text!)
    }
  }
  if (before) {
    const names = new Set(['electron', ...Object.keys(after.packages['']?.dependencies ?? {})])
    for (const name of [...names].sort()) {
      const oldVersion = before.packages[`node_modules/${name}`]?.version
      const version = after.packages[`node_modules/${name}`]?.version
      if (version && oldVersion && version !== oldVersion)
        entries.get('Dependencies')!.add(`${name}: ${oldVersion} → ${version}.`)
    }
  }
  const blocks = sections.flatMap((name) => {
    const items = [...entries.get(name)!]
    return items.length ? [`## ${name}\n\n${items.map((item) => `- ${item}`).join('\n')}`] : []
  })
  return `${blocks.join('\n\n') || 'No notable user-facing changes detected.'}\n\n[Full changes](${link})`
}

export function releaseNotes(sha: string, previous?: string, cwd = process.cwd()) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (!/^[a-f0-9]{40}$/.test(sha) || (previous && !/^v[0-9][0-9A-Za-z.+-]*$/.test(previous)))
    throw new Error('Invalid release notes range')
  if (previous) git('merge-base', '--is-ancestor', previous, sha)
  const output = git('log', '--reverse', '--no-merges', '--format=%s%x00%b%x00', previous ? `${previous}..${sha}` : sha)
  const fields = output.split('\0')
  const commits: Commit[] = []
  for (let i = 0; i + 1 < fields.length; i += 2)
    commits.push({ subject: fields[i]!.trim(), body: fields[i + 1]!.trim() })
  const lock = (ref: string) => JSON.parse(git('show', `${ref}:package-lock.json`)) as Lock
  const link = previous
    ? `https://github.com/abtv/tree/compare/${previous}...${sha}`
    : `https://github.com/abtv/tree/commits/${sha}`
  return formatReleaseNotes(commits, previous ? lock(previous) : undefined, lock(sha), link)
}
