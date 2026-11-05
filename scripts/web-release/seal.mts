import { validateManifest } from './policy.mts'
import { verifyPackage } from './package.mts'

// The caller downloads by the successful browser job's immutable artifact ID.
// Retained job outputs may refer to an earlier attempt of this same workflow run.
export async function sealPackage(directory: string, input: unknown, env: NodeJS.ProcessEnv) {
  const manifest = validateManifest(input)
  const tested = env.TESTED_BROWSER_ATTEMPT ?? ''
  const current = env.GITHUB_RUN_ATTEMPT ?? ''
  if (
    env.GITHUB_EVENT_NAME !== 'push' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_REPOSITORY !== manifest.sourceRepository ||
    env.GITHUB_SHA !== manifest.sourceSha ||
    env.GITHUB_RUN_ID !== manifest.sourceRunId ||
    !/^[1-9][0-9]*$/.test(tested) ||
    !/^[1-9][0-9]*$/.test(current) ||
    !Number.isSafeInteger(Number(current)) ||
    Number(tested) !== manifest.sourceRunAttempt ||
    Number(tested) > Number(current)
  )
    throw new Error('Tested browser package identity differs from validation')

  await verifyPackage(directory, manifest)

  return { ...manifest, sourceRunAttempt: Number(current) }
}
