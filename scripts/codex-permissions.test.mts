import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'

type Rule = { pattern: (string | string[])[]; decision: string }

// This checks coverage of the repository's literal rule declarations, without implementing
// Starlark or depending on a Codex installation in CI. Native execpolicy remains authoritative.
function declaredRules(): Rule[] {
  const directory = new URL('../.codex/rules/', import.meta.url)
  return readdirSync(directory)
    .filter((name) => name.endsWith('.rules'))
    .flatMap((name) => {
      const source = readFileSync(new URL(name, directory), 'utf8')
      const blocks = [...source.matchAll(/^prefix_rule\(([\s\S]*?)^\)/gm)]
      expect(blocks.length, `${name}: expected literal prefix_rule declarations`).toBeGreaterThan(0)
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
          pattern: pattern as Rule['pattern'],
          decision: /\bdecision\s*=\s*"([^"]+)"/.exec(block[1]!)?.[1] ?? 'allow',
        }
      })
    })
}

function explicitlyAllowed(rules: Rule[], args: string[]) {
  const matching = rules.filter((rule) =>
    rule.pattern.every((part, index) =>
      typeof part === 'string' ? part === args[index] : part.some((value) => value === args[index]),
    ),
  )
  return matching.length > 0 && matching.every((rule) => rule.decision === 'allow')
}

// These commands do not need a standing host-execution allowance. Lifecycle hooks run via
// their parent npm workflow; ordinary repository tooling runs in the workspace sandbox.
const lifecycle = ['postinstall', 'prepare', 'predev', 'prestart', 'pretest:web:built']
const sandbox = [
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
  'check:opencode',
  'changelog',
  'doctor',
  'audit',
  'test:watch',
  'test:property:soak',
  'test:mutation',
]

it('covers every package workflow with repository approval or an explicit exemption', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>
  }
  const rules = declaredRules()
  const exemptions = new Set([...lifecycle, ...sandbox])
  for (const name of exemptions) expect(name in scripts, `Stale permission exemption: ${name}`).toBe(true)
  for (const name of Object.keys(scripts)) {
    if (exemptions.has(name)) continue
    const args = ['npm', 'run', name, ...(name === 'retire:scratch' ? ['--', 'completed-task'] : [])]
    expect(explicitlyAllowed(rules, args), `Missing repository allowance: npm run ${name}`).toBe(true)
    expect(explicitlyAllowed(rules, [...args, '--help']), `Missing argument allowance: npm run ${name}`).toBe(true)
    expect(explicitlyAllowed(rules, ['npm', 'run', `${name}-extra`]), `Overbroad workflow allowance: ${name}`).toBe(
      false,
    )
  }
})
