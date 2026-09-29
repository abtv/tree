import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  collectAttachmentIds,
  parsePersistedState,
  validatePersistedState,
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
  sequence?: number
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
      return enqueue('load', [documentPath, temporaryDocumentPath, dataDirectory], async () => {
        const candidates = await listLoadCandidates(dataDirectory, documentPath, temporaryDocumentPath)
        const reads = new Map<string, { value: unknown } | { error: unknown }>()
        const readCandidate = async (path: string): Promise<{ value: unknown } | { error: unknown }> => {
          const cached = reads.get(path)
          if (cached !== undefined) return cached
          let result: { value: unknown } | { error: unknown }
          try {
            result = { value: JSON.parse(await readFile(path, 'utf8')) }
          } catch (error) {
            result = { error }
          }
          reads.set(path, result)
          return result
        }
        const primary = await readCandidate(documentPath)
        if ('value' in primary && primary.value === null) {
          // Only missing files may produce the first-launch null sentinel.
          throw new Error('The saved document has an unsupported format.')
        }
        let firstError: unknown
        for (const candidate of candidates) {
          const read = await readCandidate(candidate.path)
          if ('error' in read) {
            if (!isNotFound(read.error) && firstError === undefined) firstError = read.error
            continue
          }
          try {
            validatePersistedState(read.value)
          } catch (error) {
            if (!isNotFound(error) && firstError === undefined) {
              firstError = error
            }
            continue
          }
          if (candidate.path !== documentPath) {
            await rename(candidate.path, documentPath).catch(() => undefined)
          }
          return read.value
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
          documentPath,
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
    // One directory flush makes the rotation and replacement renames durable together.
    await syncFile(dataDirectory)
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
    const retainedCount =
      safetyIndex < 0 ? MAX_RETAINED_GENERATIONS : Math.max(MAX_RETAINED_GENERATIONS, safetyIndex + 1)
    const keep = new Set(generations.slice(0, retainedCount).map((generation) => generation.path))
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
    const match = GENERATION_PATTERN.exec(name)
    if (match === null && name !== LEGACY_BACKUP_NAME) continue
    const path = join(dataDirectory, name)
    try {
      const information = await stat(path)
      generations.push(
        match === null
          ? { path, modifiedMs: information.mtimeMs }
          : { path, modifiedMs: information.mtimeMs, sequence: Number(match[1]) },
      )
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return generations
}

async function listLoadCandidates(
  dataDirectory: string,
  documentPath: string,
  temporaryDocumentPath: string,
): Promise<DocumentGeneration[]> {
  const candidates = await listDocumentGenerations(dataDirectory)
  for (const path of [documentPath, temporaryDocumentPath]) {
    try {
      const information = await stat(path)
      candidates.push({ path, modifiedMs: information.mtimeMs })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return candidates.sort((left, right) => {
    if (right.modifiedMs !== left.modifiedMs) return right.modifiedMs - left.modifiedMs
    const rank =
      candidateRank(left.path, documentPath, temporaryDocumentPath) -
      candidateRank(right.path, documentPath, temporaryDocumentPath)
    if (rank !== 0) return rank
    return (right.sequence ?? -1) - (left.sequence ?? -1)
  })
}

function candidateRank(path: string, documentPath: string, temporaryDocumentPath: string): number {
  if (path === documentPath) return 0
  if (path === temporaryDocumentPath) return 1
  return 2
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
