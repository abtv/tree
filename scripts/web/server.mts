import { createServer } from 'vite'
import { resolve } from 'node:path'
import { appVersionPlugin } from './app-version.mts'

const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, '../../src/web'),
  oxc: { jsx: { runtime: 'automatic' } },
  plugins: [appVersionPlugin()],
  // The archive worker imports fflate after startup; discovering it then would reload the page.
  optimizeDeps: { include: ['fflate'] },
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [process.cwd()] },
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ws://127.0.0.1:5174; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    },
  },
})
await server.listen()
server.printUrls()
