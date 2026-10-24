import { readFile, writeFile } from 'node:fs/promises'
import { createManifest, verifyPackage } from './package.mts'
import { validateGate } from './policy.mts'
import { preparePackage } from './prepare.mts'
import { verifyIdentity } from './publish.mts'

try {
  const [command, first, second, ...extra] = process.argv.slice(2)
  if (extra.length) throw new Error('Unexpected arguments')
  if (command === 'manifest' && first && second) {
    const manifest = await createManifest(first, {
      sourceRepository: process.env.GITHUB_REPOSITORY,
      sourceSha: process.env.GITHUB_SHA,
      sourceRunId: process.env.GITHUB_RUN_ID,
      sourceRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    })
    await writeFile(second, `${JSON.stringify(manifest, null, 2)}\n`)
  } else if (command === 'prepare' && first && second) {
    verifyIdentity(JSON.parse(await readFile(second, 'utf8')), process.env)
    await preparePackage(first, second)
  } else if (command === 'verify' && first && second) {
    await verifyPackage(first, JSON.parse(await readFile(second, 'utf8')))
  } else if (command === 'gate' && !first) {
    validateGate(JSON.parse(process.env.RELEASE_RESULTS!))
  } else throw new Error('Usage: cli.mts manifest|prepare|verify <directory> <manifest> | gate')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
