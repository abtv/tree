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
const lock = {
  version: '0.1.16',
  lockfileVersion: 3,
  packages: {
    '': { version: '0.1.16', dependencies: { react: '19.3.0' } },
    'node_modules/react': { version: '19.3.0', resolved: 'https://example.test/react.tgz', integrity: 'sha512-old' },
  },
}

function set(path: string, text: string) {
  inputs.set(resolve(root, path), Buffer.from(text))
}

beforeEach(() => {
  inputs.clear()
  set('package.json', JSON.stringify({ version: '0.1.16', dependencies: { react: '19.3.0' } }))
  set('package-lock.json', JSON.stringify(lock))
  set('scripts/web/chromium.Dockerfile', 'dockerfile')
  set('scripts/web/chromium.Dockerfile.dockerignore', 'ignore')
  set('scripts/web/chromium-image.mk', 'build recipe')
  set('Makefile', 'shortcuts')
})

it('reuses the dependency image after a release changes all application version fields', () => {
  const original = currentDependencyImage()

  set('package.json', JSON.stringify({ version: '0.1.17', dependencies: { react: '19.3.0' } }))
  set(
    'package-lock.json',
    JSON.stringify({
      ...lock,
      version: '0.1.17',
      packages: { ...lock.packages, '': { ...lock.packages[''], version: '0.1.17' } },
    }),
  )

  expect(currentDependencyImage()).toBe(original)
})

it.each([{ version: '19.3.1' }, { resolved: 'https://example.test/other-react.tgz' }, { integrity: 'sha512-new' }])(
  'invalidates the dependency image after a locked dependency changes: %j',
  (change) => {
    const original = currentDependencyImage()

    set(
      'package-lock.json',
      JSON.stringify({
        ...lock,
        packages: { ...lock.packages, 'node_modules/react': { ...lock.packages['node_modules/react'], ...change } },
      }),
    )

    expect(currentDependencyImage()).not.toBe(original)
  },
)

it('ignores ordinary Makefile edits but requires preparation after build-recipe edits', () => {
  const original = currentDependencyImage()

  set('Makefile', 'changed help and test commands')

  expect(currentDependencyImage()).toBe(original)

  set('scripts/web/chromium-image.mk', 'changed build recipe')

  expect(currentDependencyImage()).not.toBe(original)
})
