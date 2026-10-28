import { build } from 'vite'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { offlinePackage } from './offline-package.mts'
import { createHash } from 'node:crypto'

const outDir = resolve(import.meta.dirname, '../../out/web')
await build({
  configFile: false,
  root: resolve(import.meta.dirname, '../../src/web'),
  base: './',
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir, emptyOutDir: true, target: 'es2022' },
  // Same-origin module workers run archive work off the main thread (ADR 0022).
  worker: { format: 'es' },
  plugins: [
    {
      name: 'static-browser-policy',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
            },
            injectTo: 'head-prepend',
          },
        ],
      },
    },
  ],
})
// GitHub Pages must serve the generated package without a Jekyll processing step.
await writeFile(resolve(outDir, '.nojekyll'), '')

const offline = await offlinePackage(outDir)
const workerBuild = await build({
  configFile: false,
  publicDir: false,
  define: {
    __OFFLINE_VERSION__: JSON.stringify('TREE_OFFLINE_VERSION_PLACEHOLDER'),
    __OFFLINE_FILES__: JSON.stringify(offline.files),
  },
  build: {
    outDir,
    emptyOutDir: false,
    write: false,
    target: 'es2022',
    lib: {
      entry: resolve(import.meta.dirname, '../../src/web/workers/offline.worker.ts'),
      formats: ['iife'],
      name: 'TreeOffline',
      fileName: () => 'sw.js',
    },
  },
})
if (!Array.isArray(workerBuild)) throw new Error('Expected the offline worker library output')
const worker = workerBuild[0]?.output.find((output) => output.type === 'chunk')
if (!worker || worker.type !== 'chunk') throw new Error('Missing offline worker bundle')
// Worker-only changes also get an isolated cache; failed installation must never modify the active cache.
const version = createHash('sha256').update(worker.code).digest('hex')
await writeFile(
  resolve(outDir, 'sw.js'),
  `// Tree offline version: ${version}\n${worker.code.replaceAll('TREE_OFFLINE_VERSION_PLACEHOLDER', version)}`,
)
