import { build } from 'vite'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'

const outDir = resolve(import.meta.dirname, '../../out/web')
await build({
  configFile: false,
  root: import.meta.dirname,
  base: './',
  esbuild: { jsx: 'automatic' },
  build: { outDir, emptyOutDir: true, target: 'es2022' },
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
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
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
