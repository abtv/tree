// Development documents whose `npm run` names must stay inside each coding tool's approval boundary.
// docs/DEVELOPMENT_REFERENCE.md holds reference material moved out of the development guide, so its
// workflows are governed exactly like the guide's.
export const DEVELOPMENT_DOCUMENTS = ['docs/DEVELOPMENT.md', 'docs/DEVELOPMENT_REFERENCE.md'] as const

export function documentedNpmWorkflows(contents: readonly string[]) {
  const names = contents.flatMap((content) =>
    [...content.matchAll(/npm run [A-Za-z0-9:_-]+/g)].map((match) => match[0]),
  )
  return [...new Set(names)]
}

// `npm run release` is owner-invoked (docs/releasing.md), so it must stay approval-gated; every other
// documented workflow must run without a new approval. `permits` reports whether the tool runs the
// command without asking.
export function findWorkflowApprovalIssues(
  tool: string,
  workflows: readonly string[],
  permits: (command: string) => boolean,
) {
  return workflows
    .filter((command) => permits(command) === (command === 'npm run release'))
    .map((command) => `${tool}: documented workflow ${command} must retain its approval boundary`)
}
