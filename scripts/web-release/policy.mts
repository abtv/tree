import type { Manifest } from './types.mts'

export const SOURCE_REPOSITORY = 'abtv/tree'
export const MAX_FILES = 128
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_PACKAGE_BYTES = 25 * 1024 * 1024
export const MAX_ASSET_GENERATIONS = 3

export function assetPaths(manifest: { files: { path: string }[] }) {
  return manifest.files
    .filter((file) => file.path.startsWith('assets/'))
    .map((file) => file.path)
    .sort()
}

// Installable-app files copied from src/web/public. Exact names only: never HTML,
// SVG or directories. They are current-only and never retained across releases.
export const ROOT_PUBLIC_FILES: readonly string[] = [
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
]

export function allowedPath(path: unknown) {
  return (
    path === 'index.html' ||
    path === '.nojekyll' ||
    (typeof path === 'string' && ROOT_PUBLIC_FILES.includes(path)) ||
    (typeof path === 'string' && /^assets\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:js|css|ttf|otf|woff2?)$/.test(path))
  )
}

export function validateManifest(input: unknown): Manifest {
  const manifest = input as Manifest
  if (
    ![1, 2].includes(manifest?.schema) ||
    manifest.sourceRepository !== SOURCE_REPOSITORY ||
    typeof manifest.sourceSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceSha) ||
    typeof manifest.sourceRunId !== 'string' ||
    !/^[1-9][0-9]*$/.test(manifest.sourceRunId) ||
    !Number.isSafeInteger(manifest.sourceRunAttempt) ||
    manifest.sourceRunAttempt < 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_FILES
  )
    throw new Error('Invalid release manifest identity or bounds')
  const paths = new Set<string>()
  let total = 0
  for (const file of manifest.files) {
    if (
      !allowedPath(file.path) ||
      paths.has(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > MAX_FILE_BYTES
    ) {
      throw new Error('Invalid release file')
    }
    paths.add(file.path)
    total += file.size
  }
  if (
    total > MAX_PACKAGE_BYTES ||
    !paths.has('index.html') ||
    !paths.has('.nojekyll') ||
    ![...paths].some((path) => /^assets\/.+\.js$/.test(path)) ||
    ![...paths].some((path) => /^assets\/.+\.css$/.test(path)) ||
    ![...paths].some((path) => /^assets\/.+\.(?:woff2?|ttf|otf)$/.test(path))
  ) {
    throw new Error('Incomplete or oversized release package')
  }
  if (manifest.schema === 2) {
    const generations = manifest.assetGenerations
    if (!Array.isArray(generations) || !generations.length || generations.length > MAX_ASSET_GENERATIONS) {
      throw new Error('Invalid asset generations')
    }
    const covered = new Set()
    const identities = new Set()
    for (const generation of generations) {
      if (
        !Array.isArray(generation) ||
        !generation.length ||
        generation.length > MAX_FILES ||
        generation.some((path) => typeof path !== 'string' || !path.startsWith('assets/') || !paths.has(path)) ||
        new Set(generation).size !== generation.length ||
        !generation.some((path) => path.endsWith('.js')) ||
        !generation.some((path) => path.endsWith('.css')) ||
        !generation.some((path) => /\.(?:woff2?|ttf|otf)$/.test(path))
      )
        throw new Error('Invalid asset generation')
      const key = JSON.stringify([...generation].sort())
      if (identities.has(key)) throw new Error('Duplicate asset generation')
      identities.add(key)
      for (const path of generation) covered.add(path)
    }
    if (assetPaths(manifest).some((path) => !covered.has(path))) throw new Error('Untracked release asset')
  }
  return manifest
}

export function validateGate(
  results: Record<string, { result: string | undefined }>,
  { memoryRequired, demoRequired }: { memoryRequired: unknown; demoRequired: unknown },
) {
  for (const key of ['changes', 'check', 'electron', 'audit', 'chrome']) {
    if (results[key]?.result !== 'success') throw new Error(`Release check ${key} did not succeed`)
  }
  for (const [key, required] of [
    ['memory', memoryRequired],
    ['demo', demoRequired],
  ] as const) {
    if (typeof required !== 'boolean') throw new Error(`Missing release selector for ${key}`)
    const result = results[key]?.result
    if (result !== 'success' && !(result === 'skipped' && !required)) {
      throw new Error(`Release check ${key} did not succeed`)
    }
  }
}

// Keep suite inputs aligned with demo.yml and e2e-memory.yml. Release-policy
// changes require both suites, including migration from the old push-only gate.
export function selectChecks(paths: string[]) {
  const shared = /^(?:package(?:-lock)?\.json$|\.nvmrc$|\.github\/workflows\/release\.yml$|scripts\/web-release\/)/
  return {
    demo: paths.some(
      (path) =>
        shared.test(path) ||
        /^src\/(?!web\/)/.test(path) ||
        [
          'scripts/record-demo.mts',
          'scripts/readme-screenshots.mts',
          'docs/images/demo-document.json',
          'e2e/electron/electron-entry.cjs',
          'e2e/electron/hidden-windows.cjs',
          'e2e/electron/shortcut-stub.cjs',
          'electron.vite.config.ts',
          '.github/workflows/demo.yml',
        ].includes(path),
    ),
    memory: paths.some(
      (path) =>
        shared.test(path) ||
        /^e2e\/electron\/(?:shared-application[^/]*\.spec\.ts|[^/]+\.cjs)$/.test(path) ||
        /^playwright[^/]*\.config\.ts$/.test(path) ||
        /^\.github\/workflows\/e2e[^/]*\.yml$/.test(path) ||
        [
          'e2e/electron/fixtures.ts',
          'e2e/electron/global-setup.ts',
          'e2e/electron/electron-process.ts',
          'e2e/electron/clipboard-lock.ts',
          'tsconfig.e2e.json',
          'scripts/e2e-diagnose.mts',
        ].includes(path),
    ),
  }
}
