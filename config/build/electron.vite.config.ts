import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { packageVersion } from '../../scripts/release-version.mjs'
import { buildDateLabel } from '../../scripts/build-info.mjs'

const { version } = packageVersion(['package.json', 'package-lock.json'].map((path) => readFileSync(path, 'utf8')))

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "media-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'inject-content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
      )
    },
  }
}

export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        input: {
          index: resolve('src/electron/main/index.ts'),
          // Started by the notes archive controller as `out/main/notes-archive-worker.js` (ADR 0024).
          'notes-archive-worker': resolve('src/infrastructure/main/notes-archive/archive-worker.ts'),
        },
      },
    },
  },
  preload: {
    build: { rolldownOptions: { input: resolve('src/electron/preload/index.ts') } },
  },
  renderer: {
    define: {
      __TREE_APP_VERSION__: JSON.stringify(version),
      __TREE_BUILD_DATE__: JSON.stringify(buildDateLabel(new Date())),
    },
    plugins: [react(), contentSecurityPolicyPlugin()],
    build: {
      rolldownOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
        },
      },
    },
  },
})
