import { describe, expect, it, vi } from 'vitest'
import { folderSource } from './folder-source'
import { ARCHIVE_LIMITS, NotesArchiveError } from '../../application/notes-archive/archive-policy'

describe('folder source', () => {
  function setup() {
    const getFile = vi.fn(async () => new File(['{}'], 'document.json'))
    const getFileHandle = vi.fn(async (name: string) => ({ getFile, name }))
    const folder = { name: 'Tree Backup', getFileHandle, getDirectoryHandle: vi.fn(async () => ({ getFileHandle })) }
    return { getFile, folder, source: folderSource(folder as unknown as FileSystemDirectoryHandle) }
  }
  it('reads only requested files and reports the bytes read', async () => {
    const { source, folder } = setup()

    expect(new TextDecoder().decode(await source.readDocument())).toBe('{}')
    expect(source.size).toBe(2)

    await source.readImage('a1')

    expect(folder.getFileHandle.mock.calls).toEqual([['document.json'], ['a1.png']])
    expect(source.size).toBe(4)
  })
  it('tolerates missing images and reports document and permission failures as folder errors', async () => {
    const { source, folder } = setup()
    folder.getFileHandle.mockRejectedValue(new DOMException('missing', 'NotFoundError'))

    await expect(source.readDocument()).rejects.toThrow(
      new NotesArchiveError('“Tree Backup” does not contain document.json. Choose the folder that Tree backed up to.'),
    )
    await expect(source.readImage('a1')).resolves.toBeUndefined()

    folder.getDirectoryHandle.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    const denied = new NotesArchiveError('The folder could not be read: Denied')

    await expect(source.readImage('a1')).rejects.toThrow(denied)

    folder.getFileHandle.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))

    await expect(source.readDocument()).rejects.toThrow(denied)
  })
  it('checks size before allocating a document or image', async () => {
    const { source, getFile } = setup()
    const read = vi.fn()
    getFile.mockResolvedValue({ size: ARCHIVE_LIMITS.documentBytes + 1, arrayBuffer: read } as unknown as File)

    await expect(source.readDocument()).rejects.toThrow('larger than Tree allows')
    expect(read).not.toHaveBeenCalled()

    getFile.mockResolvedValue({ size: ARCHIVE_LIMITS.imageBytes + 1, arrayBuffer: read } as unknown as File)

    await expect(source.readImage('a1')).rejects.toThrow('larger than Tree allows')
    expect(read).not.toHaveBeenCalled()
  })
})
