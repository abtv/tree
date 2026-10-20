import type { BackupDestination } from '../../application/folder-backup'

/** A close commits the new file; abort leaves the previous file intact. No delete port exists. */
async function writeFile(folder: FileSystemDirectoryHandle, name: string, value: string | Uint8Array): Promise<void> {
  const handle = await folder.getFileHandle(name, { create: true })
  const stream = await handle.createWritable()
  try {
    await stream.write(typeof value === 'string' ? value : new Blob([value.slice()]))
    await stream.close()
  } catch (error) {
    await stream.abort().catch(() => {})
    throw error
  }
}

export function folderDestination(folder: FileSystemDirectoryHandle): BackupDestination {
  let images: FileSystemDirectoryHandle | undefined
  const directory = async () => (images ??= await folder.getDirectoryHandle('attachments', { create: true }))
  return {
    async listImages() {
      const names = new Set<string>()
      for await (const [name, handle] of (await directory()).entries()) {
        // getFileHandle(create:true) can leave an empty file if the writable stream fails.
        // It is not a completed image and must be written again after a worker restart.
        if (handle.kind === 'file' && (await (handle as FileSystemFileHandle).getFile()).size > 0) names.add(name)
      }
      return names
    },
    async writeImage(name, bytes) {
      await writeFile(await directory(), name, bytes)
    },
    async writeDocument(text) {
      await writeFile(folder, 'document.json', text)
    },
  }
}
