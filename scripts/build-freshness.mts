import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

/** Build outputs that smoke checks run against, each identified by a file every build rewrites. */
export const SMOKE_BUILDS = {
  electron: { output: 'out/main/index.js', command: 'npm run build' },
  web: { output: 'out/web/index.html', command: 'npm run build:web' },
} as const

export type SmokeBuild = keyof typeof SMOKE_BUILDS

async function newestSourceChange(directory: string): Promise<number> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name))
  const times = await Promise.all(files.map(async (file) => (await stat(file)).mtimeMs))
  return Math.max(0, ...times)
}

/**
 * Rejects when the build is missing or older than a file under `src/`, so a smoke check cannot pass
 * or fail against a stale application. Smoke commands do not build; CI and the container build first.
 */
export async function assertFreshBuild(build: SmokeBuild, root = repositoryRoot): Promise<void> {
  const { output, command } = SMOKE_BUILDS[build]

  const built = await stat(resolve(root, output)).catch(() => undefined)
  if (built === undefined) throw new Error(`Missing ${output}; run ${command} before this smoke check`)

  const changed = await newestSourceChange(resolve(root, 'src'))
  if (changed > built.mtimeMs) throw new Error(`${output} is older than src/; run ${command} before this smoke check`)
}
