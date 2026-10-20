import type { NotesImportSource } from '../../application/notes-archive/import-notes'
import { ARCHIVE_LIMITS, attachmentEntryName, NotesArchiveError } from '../../application/notes-archive/archive-policy'

const isNotFound = (error: unknown) => error instanceof Error && error.name === 'NotFoundError'
const folderReadError = (error: unknown) =>
  error instanceof NotesArchiveError
    ? error
    : new NotesArchiveError(`The folder could not be read: ${error instanceof Error ? error.message : String(error)}`)

/**
 * Reads only the document and referenced images; unrelated folder contents are ignored. Folder
 * errors are reported as such, so they are not mistaken for browser storage errors.
 */
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
    async readDocument() {
      try {
        return await read(folder, 'document.json', ARCHIVE_LIMITS.documentBytes)
      } catch (error) {
        if (isNotFound(error)) {
          throw new NotesArchiveError(
            `“${folder.name}” does not contain document.json. Choose the folder that Tree backed up to.`,
          )
        }
        throw folderReadError(error)
      }
    },
    async readImage(id) {
      const name = attachmentEntryName(id).slice('attachments/'.length)
      try {
        return await read(await folder.getDirectoryHandle('attachments'), name, ARCHIVE_LIMITS.imageBytes)
      } catch (error) {
        if (isNotFound(error)) return undefined
        throw folderReadError(error)
      }
    },
  }
}
