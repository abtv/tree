// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { enterBrowserPage } from './page-admission'

afterEach(() => {
  document.head.querySelector('base')?.remove()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// @requirement PRODUCT.md §24.7
it.each([true, false])('opens the editor only when the shared page lock is granted (granted=%s)', async (granted) => {
  vi.stubEnv('PROD', true)
  const base = document.createElement('base')
  base.href = 'https://tree.test/notes/index.html'
  document.head.append(base)
  const request = vi.fn(async (_name: string, _options: LockOptions, run: (lock: object | null) => Promise<string>) =>
    run(granted ? {} : null),
  )
  vi.stubGlobal('navigator', { locks: { request } })
  const open = vi.fn(async () => 'editor ready')

  const result = enterBrowserPage(open)

  if (granted) {
    await expect(result).resolves.toBe('editor ready')
    expect(open).toHaveBeenCalledOnce()
  } else {
    await expect(result).rejects.toThrow('Tree is updating. Reload this tab after the update.')
    expect(open).not.toHaveBeenCalled()
  }
  expect(request).toHaveBeenCalledExactlyOnceWith(
    'tree-offline:https://tree.test/notes/:page-admission',
    { mode: 'shared', ifAvailable: true },
    expect.any(Function),
  )
})

it.each(['development', 'missing locks'])('opens directly in %s', async (mode) => {
  vi.stubEnv('PROD', mode !== 'development')
  const request = vi.fn()
  vi.stubGlobal('navigator', mode === 'development' ? { locks: { request } } : {})
  const open = vi.fn(async () => 'editor ready')

  await expect(enterBrowserPage(open)).resolves.toBe('editor ready')

  expect(open).toHaveBeenCalledOnce()
  expect(request).not.toHaveBeenCalled()
})
