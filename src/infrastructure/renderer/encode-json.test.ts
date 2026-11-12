import { expect, it, vi } from 'vitest'
import { encodeJson } from './encode-json'

it('preserves persisted JSON values, escaping, optional fields and repeated references', async () => {
  const child = { id: 'child', text: 'quote " slash \\ newline\n emoji 🐱 \ud800', children: [], links: undefined }
  const state = {
    version: 4,
    document: { roots: [{ id: 'root', text: '', children: [child] }] },
    view: { expandedIds: ['root'], selectedRowTop: 0 },
    location: { currentParentId: null, selectedNodeId: 'child' },
    repeated: child,
  }

  expect(await encodeJson(state)).toBe(JSON.stringify(state))
})

it('yields before a large snapshot finishes and resumes the same immutable input', async () => {
  const state = {
    roots: Array.from({ length: 5000 }, (_, index) => ({ id: String(index), text: 'text', children: [] })),
  }
  let release: (() => void) | undefined
  const yieldWork = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  let ticks = 0
  const encoded = encodeJson(state, yieldWork, () => (ticks++ < 2 ? 0 : 3))

  expect(yieldWork).toHaveBeenCalledOnce()

  release!()

  expect(await encoded).toBe(JSON.stringify(state))
})

it('propagates encoding and scheduling failures instead of returning a partial save', async () => {
  const circular: unknown[] = []
  circular.push(circular)

  await expect(encodeJson(circular)).rejects.toThrow('circular')
  await expect(encodeJson(1n)).rejects.toThrow()

  let tick = 0
  const failure = new Error('scheduler unavailable')

  await expect(
    encodeJson(
      Array.from({ length: 100 }, () => 'text'),
      async () => {
        throw failure
      },
      () => tick++ * 3,
    ),
  ).rejects.toBe(failure)
})
