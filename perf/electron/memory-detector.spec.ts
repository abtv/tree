import { expect, launchTree, test } from './fixtures'
import { MemoryProbe } from './memory-probe'
import { recordPerfResult } from '../results'

for (const target of ['rendererHeap', 'mainHeap', 'mainWorkingSet'] as const) {
  test(`detects deliberately retained ${target} allocations`, { tag: '@memory' }, async ({ userDataDir }) => {
    const launched = await launchTree(userDataDir, { memoryProbe: true })
    const probe = new MemoryProbe(test.info())
    const allocate = async (bytes: number) => {
      if (target === 'rendererHeap') {
        await launched.window.evaluate((size) => {
          const control = globalThis as typeof globalThis & { __memoryLeak?: number[] }
          control.__memoryLeak = new Array(size / 8).fill(0.5)
        }, bytes)
      } else {
        await launched.app.evaluate(
          (_electron, { size, native }) => {
            const control = globalThis as typeof globalThis & { __memoryLeak?: number[] | Uint8Array }
            // Fill every page: a reserved but untouched buffer does not prove resident-memory detection.
            control.__memoryLeak = native ? Buffer.alloc(size, 1) : new Array(size / 8).fill(0.5)
          },
          { size: bytes, native: target === 'mainWorkingSet' },
        )
      }
    }

    try {
      await probe.sample('warm', launched)
      await allocate(64 * 1024)
      await probe.sample('small-allocation', launched)

      const bytes = target === 'rendererHeap' ? 32 * 1024 ** 2 : 128 * 1024 ** 2
      await allocate(bytes)

      await expect(probe.sample('injected-leak', launched)).rejects.toThrow(new RegExp(`${target} sample`))
      recordPerfResult({ kind: 'memory-detector', scenario: target, metrics: { injectedBytes: bytes } })
    } finally {
      await launched.window.evaluate(() => {
        delete (globalThis as typeof globalThis & { __memoryLeak?: unknown }).__memoryLeak
      })
      await launched.app.evaluate(() => {
        delete (globalThis as typeof globalThis & { __memoryLeak?: unknown }).__memoryLeak
      })
    }
  })
}
