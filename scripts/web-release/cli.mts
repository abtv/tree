import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createManifest, verifyPackage } from './package.mts'
import { validateGate } from './policy.mts'
import { selectReleaseChecks } from './selection.mts'
import { preparePackage } from './prepare.mts'
import { verifyIdentity } from './publish.mts'

function flag(value: string | undefined) {
  if (value !== 'true' && value !== 'false') throw new Error('Release selector must be true or false')
  return value === 'true'
}

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
    validateGate(JSON.parse(process.env.RELEASE_RESULTS!), {
      memoryRequired: flag(process.env.RELEASE_MEMORY_REQUIRED),
      demoRequired: flag(process.env.RELEASE_DEMO_REQUIRED),
    })
  } else if (command === 'changes' && /^[a-f0-9]{40}$/.test(first!) && /^[a-f0-9]{40}$/.test(second!)) {
    const checks = await selectReleaseChecks(first, second, {
      currentRunId: process.env.GITHUB_RUN_ID,
      token: process.env.GH_TOKEN,
    })
    const output = `demo=${checks.demo}\nmemory=${checks.memory}\n`
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
    await appendFile(process.env.GITHUB_OUTPUT, output)
  } else throw new Error('Usage: cli.mts manifest|verify <directory> <manifest> | gate | changes <before> <after>')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
