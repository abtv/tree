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

export interface FileOperationEvent {
  operation: 'load' | 'save' | 'writeAttachment' | 'readAttachment' | 'hasAttachment' | 'cleanupAttachments'
  paths: string[]
  phase: 'start' | 'success' | 'failure'
  error?: string
}

export type FileOperationLogger = (event: FileOperationEvent) => void

export function createFileServices(
  dataDirectory: string,
  logger: FileOperationLogger = logFileOperation,
): FileServices {
  const documentPath = join(dataDirectory, 'document.json')
  const temporaryDocumentPath = join(dataDirectory, 'document.json.tmp')
  const backupDocumentPath = join(dataDirectory, 'document.json.bak')
  const attachmentsDirectory = join(dataDirectory, 'attachments')
  let operationQueue: Promise<void> = Promise.resolve()

  const prepare = async (): Promise<void> => {
    await mkdir(attachmentsDirectory, { recursive: true })
  }

  return {
    async load(): Promise<unknown | null> {
      return runOperation('load', [documentPath, temporaryDocumentPath, backupDocumentPath], async () => {
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
      })
    },
    save(state) {
      return enqueue('save', [dataDirectory, documentPath, temporaryDocumentPath, backupDocumentPath], () =>
        saveDocument(state),
      )
    },
    writeAttachment(id, png) {
      const logPath = join(attachmentsDirectory, `${id}.png`)
      return enqueue('writeAttachment', [logPath], async () => {
        const path = attachmentPath(attachmentsDirectory, id)
        await prepare()
        await writeFile(path, png)
      })
    },
    readAttachment(id) {
      const logPath = join(attachmentsDirectory, `${id}.png`)
      return enqueue('readAttachment', [logPath], async () => {
        const path = attachmentPath(attachmentsDirectory, id)
        try {
          return new Uint8Array(await readFile(path))
        } catch (error) {
          if (isNotFound(error)) {
            return null
          }
          throw error
        }
      })
    },
    hasAttachment(id) {
      const logPath = join(attachmentsDirectory, `${id}.png`)
      return enqueue('hasAttachment', [logPath], async () => {
        const path = attachmentPath(attachmentsDirectory, id)
        try {
          await readFile(path)
          return true
        } catch (error) {
          if (isNotFound(error)) return false
          throw error
        }
      })
    },
    cleanupAttachments(referencedIds) {
      return enqueue('cleanupAttachments', [attachmentsDirectory], async () => {
        await prepare()
        const keep = new Set(referencedIds)
        const names = await readdir(attachmentsDirectory)
        await Promise.all(
          names
            .filter((name) => name.endsWith('.png') && !keep.has(name.slice(0, -4)))
            .map((name) => unlink(join(attachmentsDirectory, name))),
        )
      })
    },
  }

  function enqueue<T>(
    operation: FileOperationEvent['operation'],
    paths: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    const result = operationQueue.then(() => runOperation(operation, paths, action))
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function runOperation<T>(
    operation: FileOperationEvent['operation'],
    paths: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    logger({ operation, paths, phase: 'start' })
    try {
      const result = await action()
      logger({ operation, paths, phase: 'success' })
      return result
    } catch (error) {
      logger({ operation, paths, phase: 'failure', error: messageOf(error) })
      throw error
    }
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

function logFileOperation(event: FileOperationEvent): void {
  if (event.phase !== 'failure' && process.env['TREE_PERSISTENCE_DEBUG'] !== '1') return
  const detail = `[persistence] ${event.operation} ${event.phase} paths=${event.paths.join(',')}`
  if (event.error === undefined) console.info(detail)
  else console.error(`${detail} error=${event.error}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
