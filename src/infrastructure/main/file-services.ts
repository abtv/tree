import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
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
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
}

export interface FileOperationEvent {
  operation: 'load' | 'save' | 'writeAttachment' | 'readAttachment' | 'cleanupAttachments'
  paths: string[]
  phase: 'start' | 'success' | 'failure'
  error?: string
}

const GENERATION_PATTERN = /^document\.(\d+)\.json$/
const LEGACY_BACKUP_NAME = 'document.json.bak'
const SAFETY_WINDOW_MS = 30_000
const MAX_RETAINED_GENERATIONS = 20

interface DocumentGeneration {
  path: string
  modifiedMs: number
}

export type FileOperationLogger = (event: FileOperationEvent) => void

export function createFileServices(
  dataDirectory: string,
  logger: FileOperationLogger = logFileOperation,
): FileServices {
  const documentPath = join(dataDirectory, 'document.json')
  const temporaryDocumentPath = join(dataDirectory, 'document.json.tmp')
  const attachmentsDirectory = join(dataDirectory, 'attachments')
  let operationQueue: Promise<void> = Promise.resolve()
  let nextGeneration: number | undefined

  const prepare = async (): Promise<void> => {
    await mkdir(attachmentsDirectory, { recursive: true })
  }

  return {
    async load(): Promise<unknown | null> {
      return runOperation('load', [documentPath, temporaryDocumentPath, dataDirectory], async () => {
        const generations = (await listDocumentGenerations(dataDirectory)).sort(
          (left, right) => right.modifiedMs - left.modifiedMs,
        )
        const candidates = [documentPath, temporaryDocumentPath, ...generations.map((generation) => generation.path)]
        let firstError: unknown
        for (const candidate of candidates) {
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
            parsePersistedState(value)
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
      return enqueue('save', [dataDirectory, documentPath, temporaryDocumentPath], () => saveDocument(state))
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
    cleanupAttachments(referencedIds) {
      return enqueue('cleanupAttachments', [attachmentsDirectory], async () => {
        await prepare()
        const keep = new Set<AttachmentId>(referencedIds)
        const recoveryPaths = [
          temporaryDocumentPath,
          ...(await listDocumentGenerations(dataDirectory)).map((generation) => generation.path),
        ]
        for (const path of recoveryPaths) {
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
    await preserveReplacedDocument()
    await rename(temporaryDocumentPath, documentPath)
    await pruneGenerations()
  }

  async function preserveReplacedDocument(): Promise<void> {
    if (nextGeneration === undefined) {
      let highest = 0
      for (const name of await readdir(dataDirectory)) {
        const match = GENERATION_PATTERN.exec(name)
        if (match !== null) highest = Math.max(highest, Number(match[1]))
      }
      nextGeneration = highest + 1
    }
    try {
      await rename(documentPath, join(dataDirectory, `document.${nextGeneration}.json`))
    } catch (error) {
      if (!isNotFound(error)) throw error
      return
    }
    nextGeneration += 1
  }

  async function pruneGenerations(): Promise<void> {
    let generations: DocumentGeneration[]
    try {
      generations = (await listDocumentGenerations(dataDirectory)).sort(
        (left, right) => right.modifiedMs - left.modifiedMs,
      )
    } catch {
      return
    }
    const safetyIndex = generations.findIndex((generation) => Date.now() - generation.modifiedMs >= SAFETY_WINDOW_MS)
    const keep = new Set<string>()
    for (const generation of generations.slice(0, MAX_RETAINED_GENERATIONS)) keep.add(generation.path)
    if (safetyIndex >= 0) keep.add(generations[safetyIndex]!.path)
    await Promise.all(
      generations
        .filter((generation) => !keep.has(generation.path))
        .map((generation) => unlink(generation.path).catch(() => undefined)),
    )
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

async function listDocumentGenerations(dataDirectory: string): Promise<DocumentGeneration[]> {
  let names: string[]
  try {
    names = await readdir(dataDirectory)
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
  const generations: DocumentGeneration[] = []
  for (const name of names) {
    if (!GENERATION_PATTERN.test(name) && name !== LEGACY_BACKUP_NAME) continue
    const path = join(dataDirectory, name)
    try {
      const information = await stat(path)
      generations.push({ path, modifiedMs: information.mtimeMs })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return generations
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
