import { expect, it } from 'vitest'
import type { Document, TreeNode } from '../domain/document'
import { ImageToTextQueue } from './image-to-text-queue'

function image(id: string, attachmentId = id): TreeNode {
  return { id, text: '', children: [], attachment: { id: attachmentId, mimeType: 'image/png' } }
}

it('keeps one drain and one active job while accepting later work in order', () => {
  const queue = new ImageToTextQueue()
  queue.enqueueIndex('first', 'png')
  expect(queue.start()).toBe(true)
  const first = queue.next()!

  expect(first).toMatchObject({ kind: 'index', nodeId: 'first', attachmentId: 'png', canceled: false })
  expect(queue.enqueueIndex('second', 'other')).toBe(true)
  expect(queue.start()).toBe(false)
  expect(queue.next()).toBeUndefined()
  expect(queue.size).toBe(2)

  queue.complete(first)
  const second = queue.next()!
  queue.complete(first)

  expect(second).toMatchObject({ kind: 'index', nodeId: 'second' })
  expect(queue.next()).toBeUndefined()
  expect(queue.size).toBe(1)

  queue.complete(second)
  expect(queue.next()).toBeUndefined()
  queue.finish()

  expect(queue.size).toBe(0)
  expect(queue.start()).toBe(true)
})

it.each(['index', 'reindex'] as const)('reconciles the source of an active %s job without reviving it', (kind) => {
  const queue = new ImageToTextQueue()
  const original: Document = { roots: [image('first', 'shared'), image('other', 'shared')] }
  if (kind === 'index') queue.enqueueIndex('first', 'shared')
  else queue.enqueueReindex(original)
  queue.start()
  const active = queue.next()!

  queue.reconcile({ roots: [original.roots[1]!] })

  expect(active.canceled).toBe(kind !== 'reindex')
  expect(active.nodeId).toBe(kind === 'reindex' ? 'other' : 'first')

  queue.reconcile({ roots: [] })
  queue.reconcile(original)

  expect(active.canceled).toBe(true)
  expect(queue.size).toBe(1)
})

it('prunes canceled pending jobs without removing the active job or surviving work', () => {
  const queue = new ImageToTextQueue()
  queue.enqueueIndex('active', 'active')
  queue.start()
  const active = queue.next()!
  queue.enqueueIndex('pending', 'pending')
  queue.enqueueReindex({ roots: [image('reindex')] })

  queue.reconcile({ roots: [image('pending')] })

  expect(active.canceled).toBe(true)
  expect(queue.size).toBe(2)
  expect(queue.next()).toBeUndefined()

  queue.complete(active)
  const next = queue.next()!

  expect(next).toMatchObject({ kind: 'index', nodeId: 'pending', canceled: false })

  queue.complete(next)
  expect(queue.next()).toBeUndefined()
  queue.finish()

  expect(queue.size).toBe(0)
})

it('keeps admission suspended until all flush owners resume without reviving canceled work', () => {
  const queue = new ImageToTextQueue()
  queue.enqueueIndex('source', 'source')
  queue.start()
  const active = queue.next()!
  queue.enqueueIndex('pending', 'pending')
  const resumeFirst = queue.suspend()
  const resumeSecond = queue.suspend()

  expect(active.canceled).toBe(true)
  expect(queue.size).toBe(1)
  expect(queue.enqueueIndex('hidden', 'hidden')).toBe(false)
  queue.enqueueReindex({ roots: [image('reindex')] })
  expect(queue.size).toBe(1)

  resumeFirst()
  resumeFirst()

  expect(queue.suspended).toBe(true)
  expect(queue.enqueueIndex('hidden', 'hidden')).toBe(false)

  resumeSecond()

  expect(queue.suspended).toBe(false)
  expect(active.canceled).toBe(true)
  expect(queue.enqueueIndex('hidden', 'hidden')).toBe(true)

  queue.complete(active)

  expect(queue.next()).toMatchObject({ nodeId: 'hidden', canceled: false })
})

// @requirement PRODUCT.md §22.1
it('bounds repeated large reindex requests by unique images and releases canceled pending identities', () => {
  const document = { roots: Array.from({ length: 10_000 }, (_, index) => image(`n${index}`, `p${index % 1000}`)) }
  const queue = new ImageToTextQueue()
  queue.enqueueIndex('n0', 'p0')
  queue.enqueueIndex('n1', 'p1')

  for (let repeat = 0; repeat < 20; repeat++) queue.enqueueReindex(document)

  expect(queue.size).toBe(1000)
  queue.start()
  const active = queue.next()!
  queue.reconcile({ roots: [] })

  expect(queue.size).toBe(1)
  expect(active.canceled).toBe(true)

  queue.complete(active)
  queue.finish()

  expect(queue.size).toBe(0)
})
