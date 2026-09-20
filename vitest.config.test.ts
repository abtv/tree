import { fileURLToPath } from 'node:url'
import { createFilter } from 'vite'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from 'vitest/node'

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url))

describe('vitest configuration', () => {
  it('does not collect specs parked in the test-results scratch directory', async () => {
    const config = await resolveConfig({ root: repositoryRoot })
    const isCollected = createFilter(config.test.include, config.test.exclude, { resolve: false })

    expect(isCollected('test-results/_layout-screenshots.spec.ts')).toBe(false)
    expect(isCollected('test-results/trace-unpacked/_probe.spec.ts')).toBe(false)
    expect(isCollected('src/domain/document.test.ts')).toBe(true)
  })
})
