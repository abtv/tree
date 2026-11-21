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
    const permitted = new Set(['npm run check'])

    const issues = findWorkflowApprovalIssues('Codex', workflows, (command) => permitted.has(command))

    expect(issues).toEqual(['Codex: documented workflow npm run test:e2e:linux must retain its approval boundary'])
  })

  it('requires the release workflow to stay approval-gated', () => {
    const workflows = documentedNpmWorkflows(['Run `npm run release`.'])

    expect(findWorkflowApprovalIssues('Claude Code', workflows, () => false)).toEqual([])
    expect(findWorkflowApprovalIssues('Claude Code', workflows, () => true)).toEqual([
      'Claude Code: documented workflow npm run release must retain its approval boundary',
    ])
  })
})
