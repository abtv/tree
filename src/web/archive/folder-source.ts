import type { NotesImportSource } from '../../application/notes-archive/import-notes'
import { ARCHIVE_LIMITS, attachmentEntryName, NotesArchiveError } from '../../application/notes-archive/archive-policy'

/** Reads only the document and referenced images; unrelated folder contents are ignored. */
export function folderSource(folder: FileSystemDirectoryHandle): NotesImportSource {
  let size = 0
  const read = async (directory: FileSystemDirectoryHandle, name: string, maximum: number) => {
    const file = await (await directory.getFileHandle(name)).getFile()
    if (file.size > maximum || size + file.size > ARCHIVE_LIMITS.archiveBytes) {
      throw new NotesArchiveError(`“${name}” is larger than Tree allows.`)
    }
    size += file.size
    return new Uint8Array(await file.arrayBuffer())
  }
  return {
    get size() {
      return size
    },
    readDocument: () => read(folder, 'document.json', ARCHIVE_LIMITS.documentBytes),
    async readImage(id) {
      const name = attachmentEntryName(id).slice('attachments/'.length)
      try {
        return await read(await folder.getDirectoryHandle('attachments'), name, ARCHIVE_LIMITS.imageBytes)
      } catch (error) {
        if (error instanceof Error && error.name === 'NotFoundError') return undefined
        throw error
      }
    },
  }
}
