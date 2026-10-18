// @editing-modes: independent
import { test, expect } from './fixtures.mjs'

// @requirement PRODUCT.md §1.4
test('serves the static package without development entry points', async ({ request }) => {
  test.skip(process.env.TREE_WEB_BUILT !== '1', 'Static-package contract applies to the built target')
  const response = await request.get('/')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('Content-Security-Policy')
  expect(html).not.toContain('main.tsx')
  expect(html).not.toContain('/@vite/client')
  expect((await request.get('/.nojekyll')).ok()).toBe(true)
  expect((await request.get('/main.tsx')).status()).toBe(404)
  expect((await request.get('/@vite/client')).status()).toBe(404)
})
