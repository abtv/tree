import { execFileSync } from 'node:child_process'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createManifest, verifyPackage } from './package.mjs'
import { selectChecks, validateGate } from './policy.mjs'
import { preparePackage } from './prepare.mjs'
import { verifyIdentity } from './publish.mjs'

function flag(value) {
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
    validateGate(JSON.parse(process.env.RELEASE_RESULTS), {
      memoryRequired: flag(process.env.RELEASE_MEMORY_REQUIRED),
      demoRequired: flag(process.env.RELEASE_DEMO_REQUIRED),
    })
  } else if (command === 'changes' && /^[a-f0-9]{40}$/.test(first) && /^[a-f0-9]{40}$/.test(second)) {
    const args = /^0{40}$/.test(first)
      ? ['ls-tree', '-r', '--name-only', '-z', second]
      : ['diff', '--name-only', '-z', first, second, '--']
    const paths = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean)
    const checks = selectChecks(paths)
    const output = `demo=${checks.demo}\nmemory=${checks.memory}\n`
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
    await appendFile(process.env.GITHUB_OUTPUT, output)
  } else throw new Error('Usage: cli.mjs manifest|verify <directory> <manifest> | gate | changes <before> <after>')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
