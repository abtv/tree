import type { EditorStore } from '../../src/application/editor-store'
import type { TreeNode } from '../../src/domain/document'
import { expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §20.14
test('recent-node retrieval and complete recalculation meet their p99 budget', async ({ userDataDir }) => {
  let deep: TreeNode = { id: 'deep18', text: 'Deep leaf', children: [] }
  for (let level = 17; level >= 0; level--)
    deep = { id: `deep${level}`, text: 'Long ancestor '.repeat(30), children: [deep] }
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 10_000 }, (_, index) => ({
        id: `n${index}`,
        text: `Node ${index} ${'long title '.repeat(30)}`,
        children: index === 9999 ? [deep] : [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'n9999' },
  })
  const { window } = await launchTree(userDataDir)
  const result = await window.evaluate(() => {
    // Test-owned inspection of React's live component props; no production test hook or alternate implementation.
    interface Fiber {
      return?: Fiber
      memoizedProps?: { store?: EditorStore }
    }
    const main = document.querySelector('main')! as unknown as Record<string, Fiber>
    const key = Object.keys(main).find((name) => name.startsWith('__reactFiber$'))!
    let fiber: Fiber | undefined = main[key]
    while (fiber?.memoizedProps?.store === undefined) fiber = fiber?.return
    const store = fiber.memoizedProps.store
    const recent = store.recentNodes
    const initial = store.getSnapshot()
    if (initial.status !== 'ready') throw new Error('Editor not ready')
    recent.load(
      Array.from({ length: 100 }, (_, i) => `n${9999 - i}`),
      initial.document,
    )
    const updates: number[] = []
    const reads: number[] = []
    let depth = 0
    let elapsed = 0
    for (const name of ['update', 'remember', 'recordChange'] as const) {
      const original = recent[name].bind(recent) as (...args: unknown[]) => void
      Object.defineProperty(recent, name, {
        value: (...args: unknown[]) => {
          const outer = depth++ === 0
          const start = performance.now()
          try {
            original(...args)
          } finally {
            depth--
            if (outer) elapsed += performance.now() - start
          }
        },
        configurable: true,
      })
    }
    for (let i = 0; i < 240; i++) {
      elapsed = 0
      const state = store.getSnapshot()
      if (state.status !== 'ready') throw new Error('Editor not ready')
      recent.remember('deep18', state.document)
      store.selectNode(`n${9999 - (i % 100)}`, 0)
      if (i % 4 === 0) store.editText(`n${9999 - (i % 100)}`, `Changed ${i}`)
      else if (i % 4 === 1) store.createSibling('before')
      else if (i % 4 === 2) store.undo()
      else store.moveSelectedTo(i % 100)
      const start = performance.now()
      recent.getResults()
      const read = performance.now() - start
      if (i >= 40) {
        updates.push(elapsed)
        reads.push(read)
      }
    }
    const stats = (values: number[]) => {
      values.sort((a, b) => a - b)
      return { p99: values[Math.ceil(values.length * 0.99) - 1]!, max: values.at(-1)! }
    }
    return { update: stats(updates), read: stats(reads), samples: updates.length }
  })
  recordPerfResult({
    kind: 'recent-nodes',
    scenario: 'wide-10000-depth20-live-store',
    samples: result.samples,
    metrics: {
      updateP99Ms: result.update.p99,
      updateMaxMs: result.update.max,
      readP99Ms: result.read.p99,
      readMaxMs: result.read.max,
    },
  })
  expect(result.update.p99).toBeLessThan(1)
  expect(result.read.p99).toBeLessThan(1)
})
