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

  it('fails a workflow named only in the reference document when no approval rule allows it', () => {
    const workflows = documentedNpmWorkflows(['Run `npm run check`.', 'Use `npm run test:e2e:linux`.'])
    const allowed = new Set(['npm run check'])

    const issues = findWorkflowApprovalIssues(workflows, (command) => (allowed.has(command) ? 'allow' : undefined))

    expect(issues).toEqual(['develop: documented workflow npm run test:e2e:linux must retain its approval boundary'])
  })

  it('requires the release workflow to keep asking', () => {
    const workflows = documentedNpmWorkflows(['Run `npm run release`.'])

    expect(findWorkflowApprovalIssues(workflows, () => 'ask')).toEqual([])
    expect(findWorkflowApprovalIssues(workflows, () => 'allow')).toEqual([
      'develop: documented workflow npm run release must retain its approval boundary',
    ])
  })
})
