import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import {
  CODEX_LIFECYCLE_SCRIPTS,
  CODEX_OWNER_ONLY_SCRIPTS,
  CODEX_SANDBOX_SCRIPTS,
  codexExplicitlyAllows,
  codexScriptArguments,
  declaredCodexRules,
} from './codex-rules.mts'

it.each(['domain', 'application', 'renderer'])('allows the named mutation workflow for the %s shard', (shard) => {
  const rules = declaredCodexRules()

  expect(
    codexExplicitlyAllows(rules, ['npm', 'run', 'test:mutation', '--', '--shard', shard, '--concurrency', '4']),
  ).toBe(true)
})

it('covers every package workflow with repository approval or an explicit exemption', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>
  }
  const rules = declaredCodexRules()
  const exemptions = new Set<string>([
    ...CODEX_LIFECYCLE_SCRIPTS,
    ...CODEX_SANDBOX_SCRIPTS,
    ...CODEX_OWNER_ONLY_SCRIPTS,
  ])

  for (const name of exemptions) expect(name in scripts, `Stale permission exemption: ${name}`).toBe(true)
  for (const name of CODEX_OWNER_ONLY_SCRIPTS) {
    expect(codexExplicitlyAllows(rules, ['npm', 'run', name]), `Publishing must remain approval-gated: ${name}`).toBe(
      false,
    )
  }

  for (const name of Object.keys(scripts)) {
    if (exemptions.has(name)) continue
    const args = codexScriptArguments(name)

    expect(codexExplicitlyAllows(rules, args), `Missing repository allowance: npm run ${name}`).toBe(true)
    expect(codexExplicitlyAllows(rules, [...args, '--help']), `Missing argument allowance: npm run ${name}`).toBe(true)
    expect(codexExplicitlyAllows(rules, ['npm', 'run', `${name}-extra`]), `Overbroad workflow allowance: ${name}`).toBe(
      false,
    )
  }
})
