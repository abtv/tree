import { expect, it, vi } from 'vitest'
import { blobArchiveFile } from './blob-archive-file'

it('reads only the requested byte range including the end and empty ranges', async () => {
  const blob = new Blob([new Uint8Array([10, 20, 30, 40, 50])])
  const slice = vi.spyOn(blob, 'slice')
  const archive = blobArchiveFile(blob)

  expect(archive.size).toBe(5)
  expect(await archive.read(1, 3)).toEqual(new Uint8Array([20, 30, 40]))
  expect(slice).toHaveBeenLastCalledWith(1, 4)
  expect(await archive.read(4, 1)).toEqual(new Uint8Array([50]))
  expect(await archive.read(5, 0)).toEqual(new Uint8Array())
})

it('rejects a truncated range and preserves an underlying read error', async () => {
  const blob = new Blob(['abc'])
  const archive = blobArchiveFile(blob)

  await expect(archive.read(2, 2)).rejects.toThrow('The file changed while it was being read.')
  const failure = new Error('file unavailable')
  const unreadable = new Blob(['a'])
  vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(failure)
  vi.spyOn(blob, 'slice').mockReturnValue(unreadable)

  await expect(archive.read(0, 1)).rejects.toBe(failure)
})
