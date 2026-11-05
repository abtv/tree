import { expect, it, vi } from 'vitest'
import { folderSource } from './folder-source'

// Exercise the aggregate limit with real File contents instead of a multi-gigabyte fixture.
vi.mock('../../application/notes-archive/archive-policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../application/notes-archive/archive-policy')>()
  return { ...actual, ARCHIVE_LIMITS: { ...actual.ARCHIVE_LIMITS, documentBytes: 8, imageBytes: 4, archiveBytes: 12 } }
})

it('accepts exact document, image and total limits, then refuses another byte before reading it', async () => {
  const document = new File(['12345678'], 'document.json')
  const image = new File(['1234'], 'first.png')
  const overflow = new File(['x'], 'second.png')
  const readOverflow = vi.spyOn(overflow, 'arrayBuffer')
  const files = new Map([
    ['document.json', document],
    ['first.png', image],
    ['second.png', overflow],
  ])
  const getFileHandle = vi.fn(async (name: string) => ({ getFile: async () => files.get(name)! }))
  const folder = { name: 'Backup', getFileHandle, getDirectoryHandle: async () => ({ getFileHandle }) }
  const source = folderSource(folder as unknown as FileSystemDirectoryHandle)

  expect(await source.readDocument()).toEqual(new TextEncoder().encode('12345678'))
  expect(await source.readImage('first')).toEqual(new TextEncoder().encode('1234'))
  expect(source.size).toBe(12)
  await expect(source.readImage('second')).rejects.toThrow('“second.png” is larger than Tree allows.')

  expect(readOverflow).not.toHaveBeenCalled()
  expect(source.size).toBe(12)
  const next = folderSource(folder as unknown as FileSystemDirectoryHandle)
  expect(await next.readImage('second')).toEqual(new TextEncoder().encode('x'))
  expect(next.size).toBe(1)
})
