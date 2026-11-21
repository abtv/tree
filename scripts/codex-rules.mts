import { readFileSync, readdirSync } from 'node:fs'

export type CodexRule = { pattern: (string | string[])[]; decision: string }

// Lifecycle hooks run through their parent npm workflow rather than as standalone commands.
export const CODEX_LIFECYCLE_SCRIPTS = ['postinstall', 'prepare', 'predev', 'prestart', 'pretest:web:built'] as const
// Publishing stays owner-invoked or explicitly approved; never grant it a standing host allowance.
export const CODEX_OWNER_ONLY_SCRIPTS = ['release'] as const
// Ordinary repository tooling runs in the workspace sandbox and needs no standing host allowance.
export const CODEX_SANDBOX_SCRIPTS = [
  'build',
  'build:web',
  'typecheck',
  'typecheck:node',
  'typecheck:renderer',
  'typecheck:e2e',
  'typecheck:scripts',
  'lint',
  'format',
  'format:check',
  'format:check:changed',
  'validation:snapshot',
  'retire:file',
  'fix:history',
  'check:docs',
  'check:requirements',
  'check:e2e-modes',
  'check:permissions',
  'doctor',
  'audit',
  'test:watch',
  'test:property',
] as const

// Reads the repository's literal rule declarations without implementing Starlark or depending on a
// Codex installation. Native execpolicy remains authoritative.
export function declaredCodexRules(directory = new URL('../.codex/rules/', import.meta.url)): CodexRule[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.rules'))
    .flatMap((name) => {
      const source = readFileSync(new URL(name, directory), 'utf8')
      const blocks = [...source.matchAll(/^prefix_rule\(([\s\S]*?)^\)/gm)]
      if (blocks.length === 0) throw new Error(`${name}: expected literal prefix_rule declarations`)

      return blocks.map((block) => {
        const literal = /^\s*pattern\s*=\s*(\[[^\n]*\]),?\s*$/m.exec(block[1]!)?.[1]
        if (!literal) throw new Error(`${name}: coverage check requires a one-line literal pattern`)
        const pattern: unknown = JSON.parse(literal)
        if (
          !Array.isArray(pattern) ||
          !pattern.length ||
          !pattern.every(
            (part) =>
              typeof part === 'string' ||
              (Array.isArray(part) && part.length && part.every((value) => typeof value === 'string')),
          )
        )
          throw new Error(`${name}: unsupported rule pattern`)
        return {
          pattern: pattern as CodexRule['pattern'],
          decision: /\bdecision\s*=\s*"([^"]+)"/.exec(block[1]!)?.[1] ?? 'allow',
        }
      })
    })
}

export function codexExplicitlyAllows(rules: readonly CodexRule[], args: readonly string[]) {
  const matching = rules.filter((rule) =>
    rule.pattern.every((part, index) =>
      typeof part === 'string' ? part === args[index] : part.some((value) => value === args[index]),
    ),
  )
  return matching.length > 0 && matching.every((rule) => rule.decision === 'allow')
}

// The arguments Codex receives for `npm run <name>`; the scratch rule requires its task separator.
export function codexScriptArguments(name: string) {
  return ['npm', 'run', name, ...(name === 'retire:scratch' ? ['--', 'completed-task'] : [])]
}

// Whether Codex runs `npm run <name>` without a new approval: through a repository rule, or in the
// workspace sandbox for ordinary tooling.
export function codexPermitsScript(rules: readonly CodexRule[], name: string) {
  if ((CODEX_OWNER_ONLY_SCRIPTS as readonly string[]).includes(name)) return false
  if ((CODEX_SANDBOX_SCRIPTS as readonly string[]).includes(name)) return true
  return codexExplicitlyAllows(rules, codexScriptArguments(name))
}
