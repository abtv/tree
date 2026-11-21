import { readFileSync } from 'node:fs'

export type ClaudeSettings = {
  permissions?: { allow?: string[]; ask?: string[]; deny?: string[] }
  sandbox?: { enabled?: boolean; autoAllowBashIfSandboxed?: boolean; excludedCommands?: string[] }
}

export type ClaudeDecision = 'deny' | 'ask' | 'allow' | 'sandbox'

export function readClaudeSettings(path = new URL('../.claude/settings.json', import.meta.url)): ClaudeSettings {
  return JSON.parse(readFileSync(path, 'utf8')) as ClaudeSettings
}

// Claude Code matches a whole Bash command against a pattern in which `*` is a wildcard.
export function claudeGlobMatches(pattern: string, command: string) {
  const expression = [...pattern]
    .map((character) => {
      if (character === '*') return '.*'
      if (character === '?') return '.'
      return character.replace(/[\\^$+.()|{}[\]]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${expression}$`, 'us').test(command)
}

function matchesBashRule(entries: readonly string[] | undefined, command: string) {
  return (entries ?? []).some((entry) => {
    const pattern = /^Bash\((.*)\)$/su.exec(entry)?.[1]
    return pattern !== undefined && claudeGlobMatches(pattern, command)
  })
}

export function claudeRunsOutsideSandbox(settings: ClaudeSettings, command: string) {
  return (settings.sandbox?.excludedCommands ?? []).some((pattern) => claudeGlobMatches(pattern, command))
}

// The decision for one Bash command, from the configuration alone: deny, ask and allow rules in that
// precedence, then the sandbox. A command excluded from the sandbox without an allow rule prompts.
// A sandboxed command runs without a prompt when the sandbox auto-allows Bash. This is configuration
// evidence; a restarted client verifies live prompts.
export function claudeDecision(settings: ClaudeSettings, command: string): ClaudeDecision {
  if (matchesBashRule(settings.permissions?.deny, command)) return 'deny'
  if (matchesBashRule(settings.permissions?.ask, command)) return 'ask'
  if (matchesBashRule(settings.permissions?.allow, command)) return 'allow'
  if (claudeRunsOutsideSandbox(settings, command)) return 'ask'
  if (settings.sandbox?.enabled === true && settings.sandbox.autoAllowBashIfSandboxed === true) return 'sandbox'
  return 'ask'
}
