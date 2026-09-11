import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PersistedEditorState } from '../../domain/document'

export interface FileServices {
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  writeAttachment(id: string, png: Uint8Array): Promise<void>
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
}

export function createFileServices(dataDirectory: string): FileServices {
  const documentPath = join(dataDirectory, 'document.json')
  const temporaryDocumentPath = join(dataDirectory, 'document.json.tmp')
  const attachmentsDirectory = join(dataDirectory, 'attachments')

  const prepare = async (): Promise<void> => {
    await mkdir(attachmentsDirectory, { recursive: true })
  }

  return {
    async load(): Promise<unknown | null> {
      try {
        return JSON.parse(await readFile(documentPath, 'utf8'))
      } catch (error) {
        if (isNotFound(error)) {
          return null
        }
        throw error
      }
    },
    async save(state): Promise<void> {
      await prepare()
      await writeFile(temporaryDocumentPath, JSON.stringify(state, null, 2), 'utf8')
      await rename(temporaryDocumentPath, documentPath)
    },
    async writeAttachment(id, png): Promise<void> {
      await prepare()
      await writeFile(attachmentPath(attachmentsDirectory, id), png)
    },
    async readAttachment(id): Promise<Uint8Array | null> {
      try {
        return new Uint8Array(await readFile(attachmentPath(attachmentsDirectory, id)))
      } catch (error) {
        if (isNotFound(error)) {
          return null
        }
        throw error
      }
    },
    async cleanupAttachments(referencedIds): Promise<void> {
      await prepare()
      const keep = new Set(referencedIds)
      const names = await readdir(attachmentsDirectory)
      await Promise.all(
        names
          .filter((name) => name.endsWith('.png') && !keep.has(name.slice(0, -4)))
          .map((name) => unlink(join(attachmentsDirectory, name))),
      )
    },
  }
}

function attachmentPath(attachmentsDirectory: string, id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('Attachment IDs may contain only letters, numbers, underscores, and hyphens.')
  }
  return join(attachmentsDirectory, `${id}.png`)
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
