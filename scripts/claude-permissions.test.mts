import { describe, expect, it } from 'vitest'

import { claudeDecision, type ClaudeSettings } from './claude-permissions.mts'

const settings: ClaudeSettings = {
  permissions: {
    allow: ['Bash(npm run test*)', 'Bash(npm run check*)'],
    ask: ['Bash(npm run release*)'],
    deny: ['Bash(node *)', 'Bash(npm run check:danger*)'],
  },
  sandbox: { enabled: true, autoAllowBashIfSandboxed: true, excludedCommands: ['npm run test:e2e*', 'npm run dev'] },
}

describe('Claude Code permission decision', () => {
  it('applies deny before ask before allow', () => {
    expect(claudeDecision(settings, 'npm run check:danger')).toBe('deny')
    expect(claudeDecision(settings, 'npm run release')).toBe('ask')
    expect(claudeDecision(settings, 'npm run check:docs')).toBe('allow')
  })

  it('auto-allows a sandboxed command without a rule', () => {
    expect(claudeDecision(settings, 'npm run lint')).toBe('sandbox')
  })

  it('prompts for a command excluded from the sandbox without an allow rule', () => {
    expect(claudeDecision(settings, 'npm run dev')).toBe('ask')
    expect(claudeDecision(settings, 'npm run test:e2e -- spec.ts')).toBe('allow')
  })

  it('prompts for an unruled command when the sandbox does not auto-allow', () => {
    const strict: ClaudeSettings = { ...settings, sandbox: { enabled: true, autoAllowBashIfSandboxed: false } }

    expect(claudeDecision(strict, 'npm run lint')).toBe('ask')
  })
})
