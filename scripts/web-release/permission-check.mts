import type { ApiError, Manifest, Request } from './types.mts'

// Probe only an isolated temporary branch. The protected main workflow and the
// live release are never altered, even if the token unexpectedly has more power.
export async function assertWorkflowWriteDenied(
  root: string,
  baseSha: string,
  manifest: Pick<Manifest, 'sourceRunId' | 'sourceRunAttempt'>,
  { request, token }: { request: Request; token: string },
) {
  const branch = `tree-publisher-permission-probe-${manifest.sourceRunId}-${manifest.sourceRunAttempt}`
  await request(`${root}/git/refs`, {
    token,
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  })
  try {
    // Prove ordinary Contents writes work through the same API and branch.
    // Only then can its documented integration-permission denial distinguish
    // the workflow write from an inaccessible repository or read-only token.
    await request(`${root}/contents/tree-publisher-permission-probe.txt`, {
      token,
      method: 'PUT',
      body: {
        branch,
        message: 'ci(pages): probe publisher contents permission',
        content: Buffer.from('Temporary permission probe\n').toString('base64'),
      },
    })
    try {
      await request(`${root}/contents/.github/workflows/tree-publisher-permission-probe.yml`, {
        token,
        method: 'PUT',
        body: {
          branch,
          message: 'ci(pages): probe publisher workflow permission boundary',
          content: Buffer.from(
            'name: Permission boundary probe\non: workflow_dispatch\njobs:\n  probe:\n    runs-on: ubuntu-latest\n    steps:\n      - run: exit 0\n',
          ).toString('base64'),
        },
      })
    } catch (error) {
      if ((error as ApiError).status === 403 && (error as ApiError).workflowWriteDenied === true) return
      throw error
    }
    throw new Error('Publisher can write workflows; publication refused')
  } finally {
    await request(`${root}/git/refs/heads/${branch}`, { token, method: 'DELETE' })
  }
}
