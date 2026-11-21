import { describe, expect, it } from 'vitest'

import {
  DEVELOPMENT_DOCUMENTS,
  documentedNpmWorkflows,
  findWorkflowApprovalIssues,
} from './documented-npm-workflows.mts'

describe('documented npm workflows', () => {
  it('scans the development guide and the development reference', () => {
    expect(DEVELOPMENT_DOCUMENTS).toEqual(['docs/DEVELOPMENT.md', 'docs/DEVELOPMENT_REFERENCE.md'])
  })

  it('collects each workflow once across documents', () => {
    const guide = 'Run `npm run check`, then `npm run check` again.'
    const reference = 'Use `npm run test:e2e:linux` and `npm run check`.'

    const workflows = documentedNpmWorkflows([guide, reference])

    expect(workflows).toEqual(['npm run check', 'npm run test:e2e:linux'])
  })

  it('fails a workflow named only in the reference document when the tool does not permit it', () => {
    const workflows = documentedNpmWorkflows(['Run `npm run check`.', 'Use `npm run test:e2e:linux`.'])

    const issues = findWorkflowApprovalIssues('Codex', workflows, (command) =>
      command === 'npm run check' ? 'permitted' : 'prompt',
    )

    expect(issues).toEqual(['Codex: documented workflow npm run test:e2e:linux must run without a new approval'])
  })

  it('accepts only a denial for the owner-only release workflow', () => {
    const workflows = documentedNpmWorkflows(['Run `npm run release`.'])

    expect(findWorkflowApprovalIssues('Claude Code', workflows, () => 'denied')).toEqual([])
    for (const decision of ['prompt', 'permitted'] as const) {
      expect(findWorkflowApprovalIssues('Claude Code', workflows, () => decision)).toEqual([
        'Claude Code: owner-only workflow npm run release must be denied to agents',
      ])
    }
  })
})
