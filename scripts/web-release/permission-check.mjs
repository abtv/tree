// Probe only an isolated temporary branch. The protected main workflow and the
// live release are never altered, even if the token unexpectedly has more power.
export async function assertWorkflowWriteDenied(root, baseSha, manifest, { request, token }) {
  const branch = `tree-publisher-permission-probe-${manifest.sourceRunId}-${manifest.sourceRunAttempt}`
  await request(`${root}/git/refs`, {
    token,
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  })
  try {
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
      if (error.status === 403 || error.status === 404) return
      throw error
    }
    throw new Error('Publisher can write workflows; publication refused')
  } finally {
    await request(`${root}/git/refs/heads/${branch}`, { token, method: 'DELETE' })
  }
}
