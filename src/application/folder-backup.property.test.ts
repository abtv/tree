import { afterEach, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { startFolderBackup } from './folder-backup'

afterEach(() => vi.useRealTimers())

it('coalesces arbitrary saved versions and eventually writes the last one without overlapping writes', async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 12_000 }), { minLength: 1, maxLength: 30 }), async (delays) => {
      vi.useFakeTimers()
      let version = 0
      let written = -1
      let inFlight = 0
      let maximumInFlight = 0
      const backup = startFolderBackup(
        {
          readHead: async () => ({
            version: 4,
            document: { roots: [{ id: 'a', text: String(version), children: [] }] },
            location: { currentParentId: null, selectedNodeId: 'a' },
            view: { expandedIds: [] },
          }),
          readImage: async () => undefined,
        },
        {
          listImages: async () => new Set(),
          writeImage: async () => {
            throw new Error('No images')
          },
          writeDocument: async (text) => {
            inFlight += 1
            maximumInFlight = Math.max(maximumInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 20))
            written = Number(JSON.parse(text).document.roots[0].text)
            inFlight -= 1
          },
        },
        {
          now: () => Date.now(),
          setTimeout: (callback, delay) => setTimeout(callback, delay),
          clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        },
        () => {},
      )
      for (const delay of delays) {
        await vi.advanceTimersByTimeAsync(delay)
        version += 1
        backup.saved()
      }
      await vi.advanceTimersByTimeAsync(20_020)
      expect(written).toBe(version)
      expect(maximumInFlight).toBe(1)
      backup.stop()
      vi.useRealTimers()
    }),
    { numRuns: 30 },
  )
})
