import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { publicationHead } from './status.mts'

it('verifies the transferred commit without reading a potentially stale branch head', async () => {
  const sha = 'a'.repeat(40)
  const request = vi.fn(async () => ({ object: { sha: 'b'.repeat(40) } }))

  expect(await publicationHead(sha, request)).toBe(sha)
  expect(request).not.toHaveBeenCalled()
})

it('resolves the existing head when retrying an already transferred release', async () => {
  const sha = 'b'.repeat(40)
  const request = vi.fn(async () => ({ object: { sha } }))

  expect(await publicationHead('', request)).toBe(sha)
  expect(request).toHaveBeenCalledWith('/repos/tree-editor/tree-editor.github.io/git/ref/heads/main')
})

it('rejects an invalid transferred commit before requesting metadata', async () => {
  const request = vi.fn()

  await expect(publicationHead('main', request)).rejects.toThrow('Invalid transferred commit')
  expect(request).not.toHaveBeenCalled()
})

it('loads the release candidate checker without installed npm dependencies', () => {
  const moduleUrl = pathToFileURL(resolve('scripts/web-release/status.mts')).href
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import { registerHooks } from 'node:module'
        registerHooks({
          resolve(specifier, context, nextResolve) {
            if (!/^(node:|file:|\\.)/.test(specifier)) {
              throw new Error('Unexpected npm dependency: ' + specifier)
            }
            return nextResolve(specifier, context)
          }
        })
        await import(${JSON.stringify(moduleUrl)})
      `,
    ],
    { encoding: 'utf8', timeout: 10000 },
  )

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
})
