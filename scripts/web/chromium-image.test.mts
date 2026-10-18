import { resolve } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { currentDependencyImage } from './chromium-image.mts'

const inputs = vi.hoisted(() => new Map<string, Buffer>())
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    const bytes = inputs.get(path)
    if (!bytes) throw new Error(`Unexpected image input: ${path}`)
    return bytes
  }),
}))

const root = resolve(import.meta.dirname, '../..')
function set(path: string, text: string) {
  inputs.set(resolve(root, path), Buffer.from(text))
}

beforeEach(() => {
  inputs.clear()
  set('package.json', JSON.stringify({ dependencies: { react: '19.3.0' } }))
  set('package-lock.json', 'lock')
  set('scripts/web/chromium.Dockerfile', 'dockerfile')
  set('scripts/web/chromium.Dockerfile.dockerignore', 'ignore')
  set('scripts/web/chromium-image.mk', 'build recipe')
  set('Makefile', 'shortcuts')
})

it('ignores ordinary Makefile edits but requires preparation after build-recipe edits', () => {
  const original = currentDependencyImage()
  set('Makefile', 'changed help and test commands')
  expect(currentDependencyImage()).toBe(original)
  set('scripts/web/chromium-image.mk', 'changed build recipe')
  expect(currentDependencyImage()).not.toBe(original)
})
