import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createStaticServer } from './static-server.mjs'

// @requirement PRODUCT.md §1.4
await import('./build.mjs')
const root = resolve(import.meta.dirname, '../../out/web')
const html = await readFile(resolve(root, 'index.html'), 'utf8')
assert(html.includes('Content-Security-Policy'))
assert(!html.includes('main.tsx'))
assert(!html.includes('/@vite/client'))
assert((await readdir(root)).includes('.nojekyll'))
const server = createStaticServer()
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}/`
try {
  assert.equal((await fetch(`${url}main.tsx`)).status, 404)
  assert.equal((await fetch(`${url}@vite/client`)).status, 404)
  for (const mode of ['', 'theme', 'menu', 'storage', 'quit']) {
    const child = spawn(process.execPath, [resolve(import.meta.dirname, 'verify.mjs'), mode], {
      stdio: 'inherit',
      env: { ...process.env, TREE_WEB_URL: url },
    })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0, `Built browser check failed: ${mode || 'editor'}`)
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}
