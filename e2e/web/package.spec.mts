// @editing-modes: independent
import { test, expect } from './fixtures.mts'

// @requirement PRODUCT.md §1.4
test('serves the static package without development entry points', async ({ request }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Static-package contract applies to the built target')
  const response = await request.get('/')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('Content-Security-Policy')
  // ADR 0022: archive work runs in a same-origin module worker; other worker sources stay blocked.
  expect(html.replaceAll('&#39;', "'")).toContain("worker-src 'self';")
  const script = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)![1]!
  const worker = (await (await request.get(`/${script}`)).text()).match(/archive\.worker-[\w-]+\.js/)
  expect(worker, 'The application bundle must reference the hashed archive worker').not.toBeNull()
  expect((await request.get(`/assets/${worker![0]}`)).ok()).toBe(true)
  // PRODUCT §24.1: the installable-app files are package-relative root files.
  expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest"')
  expect(html).toContain('<link rel="apple-touch-icon" href="./apple-touch-icon.png"')
  expect(html).not.toContain('main.tsx')
  expect(html).not.toContain('/@vite/client')
  expect((await request.get('/.nojekyll')).ok()).toBe(true)
  expect((await request.get('/main.tsx')).status()).toBe(404)
  expect((await request.get('/@vite/client')).status()).toBe(404)
})
