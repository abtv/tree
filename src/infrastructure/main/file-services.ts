import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  collectAttachmentIds,
  parsePersistedState,
  type AttachmentId,
  type PersistedEditorState,
} from '../../domain/document'

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
          let value: unknown
          try {
            value = JSON.parse(await readFile(candidate, 'utf8'))
          } catch (error) {
            if (!isNotFound(error) && firstError === undefined) firstError = error
            continue
          }
          if (candidate === documentPath) {
            // Only missing files may produce the first-launch null sentinel.
            if (value === null) throw new Error('The saved document has an unsupported format.')
            return value
          }
          try {
            const state = parsePersistedState(value)
            for (const id of collectAttachmentIds(state.document)) {
              if (!(await attachmentExists(attachmentsDirectory, id))) {
                throw new Error(`Attachment ${id} is missing from local storage.`)
              }
            }
            await rename(candidate, documentPath)
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
        await writeDurableFile(path, png)
        await syncFile(attachmentsDirectory)
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
      return enqueue('hasAttachment', [logPath], () => attachmentExists(attachmentsDirectory, id))
    },
    cleanupAttachments(referencedIds) {
      return enqueue('cleanupAttachments', [attachmentsDirectory], async () => {
        await prepare()
        const keep = new Set<AttachmentId>(referencedIds)
        for (const path of [temporaryDocumentPath, backupDocumentPath]) {
          for (const id of await readRecoveryAttachmentIds(path)) keep.add(id)
        }
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

async function attachmentExists(attachmentsDirectory: string, id: string): Promise<boolean> {
  try {
    await stat(attachmentPath(attachmentsDirectory, id))
    return true
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

async function readRecoveryAttachmentIds(path: string): Promise<ReadonlySet<AttachmentId>> {
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return new Set()
    throw error
  }
  try {
    return collectAttachmentIds(parsePersistedState(JSON.parse(contents)).document)
  } catch {
    return new Set()
  }
}

async function writeDurableFile(path: string, contents: string | Uint8Array): Promise<void> {
  const file = await open(path, 'w')
  try {
    if (typeof contents === 'string') await file.writeFile(contents, 'utf8')
    else await file.writeFile(contents)
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
