import { copyFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PersistedEditorState } from '../../domain/document'

export interface FileServices {
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  writeAttachment(id: string, png: Uint8Array): Promise<void>
  hasAttachment(id: string): Promise<boolean>
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
}

export function createFileServices(dataDirectory: string): FileServices {
  const documentPath = join(dataDirectory, 'document.json')
  const temporaryDocumentPath = join(dataDirectory, 'document.json.tmp')
  const backupDocumentPath = join(dataDirectory, 'document.json.bak')
  const attachmentsDirectory = join(dataDirectory, 'attachments')
  let saveQueue: Promise<void> = Promise.resolve()

  const prepare = async (): Promise<void> => {
    await mkdir(attachmentsDirectory, { recursive: true })
  }

  return {
    async load(): Promise<unknown | null> {
      let firstError: unknown
      for (const candidate of [documentPath, temporaryDocumentPath, backupDocumentPath]) {
        try {
          const value = JSON.parse(await readFile(candidate, 'utf8'))
          if (candidate !== documentPath) {
            await rename(candidate, documentPath)
          }
          return value
        } catch (error) {
          if (!isNotFound(error) && firstError === undefined) {
            firstError = error
          }
        }
      }
      if (firstError !== undefined) throw firstError
      return null
    },
    save(state): Promise<void> {
      const operation = saveQueue.then(() => saveDocument(state))
      saveQueue = operation.catch(() => undefined)
      return operation
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
    async hasAttachment(id): Promise<boolean> {
      return (await this.readAttachment(id)) !== null
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

  async function saveDocument(state: PersistedEditorState): Promise<void> {
    await prepare()
    await writeDurableFile(temporaryDocumentPath, JSON.stringify(state, null, 2))
    try {
      await copyFile(documentPath, backupDocumentPath)
      await syncFile(backupDocumentPath)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
    await rename(temporaryDocumentPath, documentPath)
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

async function writeDurableFile(path: string, contents: string): Promise<void> {
  const file = await open(path, 'w')
  try {
    await file.writeFile(contents, 'utf8')
    await file.sync()
  } finally {
    await file.close()
  }
}

async function syncFile(path: string): Promise<void> {
  const file = await open(path, 'r')
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}
