// Development documents whose `npm run` names must stay inside the OpenCode develop approval boundary.
// docs/DEVELOPMENT_REFERENCE.md holds reference material moved out of the development guide, so its
// workflows are governed exactly like the guide's.
export const DEVELOPMENT_DOCUMENTS = ['docs/DEVELOPMENT.md', 'docs/DEVELOPMENT_REFERENCE.md'] as const

export function documentedNpmWorkflows(contents: readonly string[]) {
  const names = contents.flatMap((content) =>
    [...content.matchAll(/npm run [A-Za-z0-9:_-]+/g)].map((match) => match[0]),
  )
  return [...new Set(names)]
}

// `npm run release` publishes, so it must keep asking; every other documented workflow must be allowed.
export function findWorkflowApprovalIssues(
  workflows: readonly string[],
  permissionFor: (command: string) => string | undefined,
) {
  return workflows
    .filter((command) => permissionFor(command) !== (command === 'npm run release' ? 'ask' : 'allow'))
    .map((command) => `develop: documented workflow ${command} must retain its approval boundary`)
}
