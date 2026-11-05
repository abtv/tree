import { describe, expect, it, vi } from 'vitest'
import { folderDestination } from './folder-destination'

function fixture() {
  const stream = {
    write: vi.fn(async (value: unknown) => {
      void value
    }),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  }
  const file = { createWritable: vi.fn(async () => stream) }
  const images = {
    getFileHandle: vi.fn(async (name: string, options: unknown) => ({ ...file, name, options })),
    async *entries() {
      yield ['a.png', { kind: 'file', getFile: async () => ({ size: 1 }) }]
      yield ['unfinished.png', { kind: 'file', getFile: async () => ({ size: 0 }) }]
      yield ['nested', { kind: 'directory' }]
    },
  }
  const folder = {
    getDirectoryHandle: vi.fn(async () => images),
    getFileHandle: vi.fn(async (name: string, options: unknown) => ({ ...file, name, options })),
  }
  return {
    stream,
    file,
    images,
    folder,
    destination: folderDestination(folder as unknown as FileSystemDirectoryHandle),
  }
}

describe('folder destination', () => {
  it('reuses the attachment directory after creation and retries a failed lookup', async () => {
    const { destination, folder, images } = fixture()
    const failure = new DOMException('Denied', 'NotAllowedError')
    folder.getDirectoryHandle.mockRejectedValueOnce(failure)

    await expect(destination.listImages()).rejects.toBe(failure)
    await expect(destination.listImages()).resolves.toEqual(new Set(['a.png']))
    await destination.writeImage('b.png', new Uint8Array([2]))

    expect(folder.getDirectoryHandle).toHaveBeenCalledTimes(2)
    expect(folder.getDirectoryHandle).toHaveBeenLastCalledWith('attachments', { create: true })
    expect(images.getFileHandle).toHaveBeenCalledWith('b.png', { create: true })
  })

  it.each(['write', 'close'] as const)('preserves the %s error when abort also fails', async (operation) => {
    const { destination, stream } = fixture()
    const failure = new DOMException('Storage full', 'QuotaExceededError')
    stream[operation].mockRejectedValueOnce(failure)
    stream.abort.mockRejectedValueOnce(new Error('Stream already closed'))

    await expect(destination.writeImage('b.png', new Uint8Array([1]))).rejects.toBe(failure)

    expect(stream.abort).toHaveBeenCalledOnce()
    expect(stream.close).toHaveBeenCalledTimes(operation === 'close' ? 1 : 0)
  })

  it('lists files only, writes into attachments and commits document.json by closing its stream', async () => {
    const { destination, folder, images, stream } = fixture()

    expect(await destination.listImages()).toEqual(new Set(['a.png']))

    await destination.writeImage('b.png', new Uint8Array([1, 2]))

    expect(images.getFileHandle).toHaveBeenCalledWith('b.png', { create: true })

    const image = stream.write.mock.calls[0]![0] as Blob

    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([1, 2])

    await destination.writeDocument('json')

    expect(folder.getFileHandle).toHaveBeenCalledWith('document.json', { create: true })
    expect(stream.write).toHaveBeenLastCalledWith('json')
    expect(stream.close).toHaveBeenCalledTimes(2)
    expect(stream.abort).not.toHaveBeenCalled()
  })
  it.each(['write', 'close'] as const)('aborts and propagates a %s failure', async (operation) => {
    const { destination, stream } = fixture()
    const failure = new DOMException('Denied', 'NotAllowedError')
    stream[operation].mockRejectedValueOnce(failure)

    await expect(destination.writeDocument('json')).rejects.toBe(failure)
    expect(stream.abort).toHaveBeenCalledOnce()
  })
})
