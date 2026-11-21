// Development documents whose `npm run` names must stay inside each coding tool's approval boundary.
// docs/DEVELOPMENT_REFERENCE.md holds reference material moved out of the development guide, so its
// workflows are governed exactly like the guide's.
export const DEVELOPMENT_DOCUMENTS = ['docs/DEVELOPMENT.md', 'docs/DEVELOPMENT_REFERENCE.md'] as const

// Only the Product Owner runs these workflows (docs/releasing.md); agents never do.
export const OWNER_ONLY_WORKFLOWS = ['npm run release'] as const

export type ToolDecision = 'permitted' | 'prompt' | 'denied'

export function documentedNpmWorkflows(contents: readonly string[]) {
  const names = contents.flatMap((content) =>
    [...content.matchAll(/npm run [A-Za-z0-9:_-]+/g)].map((match) => match[0]),
  )
  return [...new Set(names)]
}

// A tool must deny an owner-only workflow and run every other documented workflow without a new
// approval.
export function findWorkflowApprovalIssues(
  tool: string,
  workflows: readonly string[],
  decide: (command: string) => ToolDecision,
) {
  return workflows.flatMap((command) => {
    const ownerOnly = (OWNER_ONLY_WORKFLOWS as readonly string[]).includes(command)
    const decision = decide(command)
    if (ownerOnly && decision !== 'denied') {
      return [`${tool}: owner-only workflow ${command} must be denied to agents`]
    }
    if (!ownerOnly && decision !== 'permitted') {
      return [`${tool}: documented workflow ${command} must run without a new approval`]
    }
    return []
  })
}
