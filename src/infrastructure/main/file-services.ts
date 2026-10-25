import { randomUUID } from 'node:crypto'
import { copyFile, link, mkdir, open, readFile, readdir, rename, stat, unlink, utimes } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  collectAttachmentIds,
  isValidAttachmentId,
  parsePersistedState,
  validatePersistedState,
  type AttachmentId,
  type PersistedEditorState,
} from '../../domain/document'
import { NOTES_REPLACED_MESSAGE } from '../../shared/ipc'
import { createRecentNodesStore } from './recent-nodes'
import {
  commitReplacement,
  isDocumentFileName,
  nodeReplacementFileSystem,
  notesLayout,
  recoverReplacement,
  ReplacementIncompleteError,
  type NotesLayout,
} from './notes-replacement'

export interface FileServices {
  loadRecentNodes?(): Promise<string[]>
  saveRecentNodes?(ids: readonly string[]): Promise<void>
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  writeAttachment(id: string, png: Uint8Array): Promise<void>
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
}

/** Operations that desktop export and import use (ADR 0024). */
export interface NotesArchiveFileServices {
  /** Creates an empty staging directory with `attachments/` that recovery leaves alone until discarded. */
  createStagingDirectory(): Promise<string>
  discardStagingDirectory(path: string): Promise<void>
  /**
   * Replaces the notes with a staging directory's `document.json` and `attachments/`. Returns the
   * Replaced Notes folder, or null when there were no previous notes. Afterwards saves and image
   * writes are rejected until the next load. The archive name is recorded for recovery to report.
   */
  replaceNotes(stagingPath: string, archive?: string): Promise<string | null>
  /** The Replaced Notes folder and archive name of a replacement that the last load completed, once. */
  takeRecoveredReplacement(): RecoveredNotesReplacement | undefined
  /** Hard-links the current document files into a new directory that saves cannot change. */
  snapshotDocuments(): Promise<string>
  releaseSnapshot(path: string): Promise<void>
  /** Keeps the images from attachment cleanup until the returned function runs. */
  pinAttachments(ids: Iterable<string>): () => void
}

export interface RecoveredNotesReplacement {
  readonly replacedFolder: string | null
  readonly archive?: string
}

export interface FileServicesOptions {
  /** The application's user-data directory, which holds the staging, snapshot and Replaced Notes folders. */
  readonly userDataDirectory: string
  readonly now?: () => Date
}

export interface FileOperationEvent {
  operation:
    | 'load'
    | 'save'
    | 'writeAttachment'
    | 'readAttachment'
    | 'cleanupAttachments'
    | 'replaceNotes'
    | 'snapshotDocuments'
    | 'recentNodes'
  paths: string[]
  phase: 'start' | 'success' | 'failure'
  error?: string
}

export { NOTES_REPLACED_MESSAGE }

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
  options?: FileServicesOptions,
): FileServices & NotesArchiveFileServices {
  const documentPath = join(dataDirectory, 'document.json')
  const recentNodes = createRecentNodesStore(join(dataDirectory, 'recent-nodes.json'))
  const temporaryDocumentPath = join(dataDirectory, 'document.json.tmp')
  const attachmentsDirectory = join(dataDirectory, 'attachments')
  const layout = options === undefined ? undefined : notesLayout(options.userDataDirectory, dataDirectory)
  const now = options?.now ?? (() => new Date())
  let operationQueue: Promise<void> = Promise.resolve()
  let nextGeneration: number | undefined
  // Set once a replacement reached its journal: the old session must not write over the new notes.
  let replaced = false
  let recovered: RecoveredNotesReplacement | undefined
  // Staging and snapshot directory names that recovery must not sweep.
  const active = new Set<string>()
  const pinned = new Set<ReadonlySet<string>>()

  const prepare = async (): Promise<void> => {
    await mkdir(attachmentsDirectory, { recursive: true })
  }
  const archiveLayout = (): NotesLayout => {
    if (layout === undefined) throw new Error('Notes export and import are not configured.')
    return layout
  }
  const rejectAfterReplacement = () => {
    if (replaced) throw new Error(NOTES_REPLACED_MESSAGE)
  }

  return {
    loadRecentNodes: () => enqueue('recentNodes', [dataDirectory], () => recentNodes.load()),
    saveRecentNodes: (ids) =>
      enqueue('recentNodes', [dataDirectory], async () => {
        rejectAfterReplacement()
        await recentNodes.save(ids)
      }),
    async load(): Promise<unknown | null> {
      return enqueue('load', [documentPath, temporaryDocumentPath, dataDirectory], async () => {
        if (layout !== undefined) {
          try {
            const recovery = await recoverReplacement(nodeReplacementFileSystem, layout, active)
            if (recovery.completed) {
              recovered = {
                replacedFolder: recovery.replacedFolder,
                ...(recovery.archive === undefined ? {} : { archive: recovery.archive }),
              }
            }
          } catch (error) {
            throw new Error(`The notes import could not be completed: ${messageOf(error)}`, { cause: error })
          }
          nextGeneration = undefined
          replaced = false
        }
        const newest = await findNewestValidDocument(dataDirectory)
        if (newest === null) return null
        if ('error' in newest) throw newest.error
        if (newest.path !== documentPath) {
          await rename(newest.path, documentPath).catch(() => undefined)
        }
        return newest.value
      })
    },
    save(state) {
      return enqueue('save', [dataDirectory, documentPath, temporaryDocumentPath], async () => {
        rejectAfterReplacement()
        await saveDocument(state)
      })
    },
    writeAttachment(id, png) {
      const logPath = join(attachmentsDirectory, `${id}.png`)
      return enqueue('writeAttachment', [logPath], async () => {
        rejectAfterReplacement()
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
        // The replaced session's references describe the old notes, not the imported images.
        if (replaced) return
        await prepare()
        const keep = new Set<AttachmentId>(referencedIds)
        for (const ids of pinned) for (const id of ids) keep.add(id)
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
    async createStagingDirectory() {
      const { importDirectory } = archiveLayout()
      const name = randomUUID()
      active.add(name)
      const path = join(importDirectory, name)
      try {
        await mkdir(join(path, 'attachments'), { recursive: true })
      } catch (error) {
        active.delete(name)
        throw error
      }
      return path
    },
    async discardStagingDirectory(path) {
      await removeOwnedDirectory(archiveLayout().importDirectory, path)
    },
    replaceNotes(stagingPath, archiveName) {
      return enqueue('replaceNotes', [dataDirectory, stagingPath], async () => {
        const archive = archiveLayout()
        const staging = ownedName(archive.importDirectory, stagingPath)
        rejectAfterReplacement()
        try {
          const folder = await commitReplacement(nodeReplacementFileSystem, archive, staging, now(), archiveName)
          // Set inside the queued operation, so no save queued behind it can write the old notes.
          replaced = true
          nextGeneration = undefined
          active.delete(staging)
          return folder
        } catch (error) {
          // After the journal only roll-forward is possible: keep the old session from writing,
          // and keep the staging directory, which the next start completes from.
          if (error instanceof ReplacementIncompleteError) {
            replaced = true
            nextGeneration = undefined
            active.delete(staging)
          }
          throw error
        }
      })
    },
    takeRecoveredReplacement() {
      const result = recovered
      recovered = undefined
      return result
    },
    async snapshotDocuments() {
      const { exportDirectory } = archiveLayout()
      const name = randomUUID()
      const snapshot = join(exportDirectory, name)
      return enqueue('snapshotDocuments', [dataDirectory, snapshot], async () => {
        active.add(name)
        try {
          await mkdir(snapshot, { recursive: true })
          for (const entry of await readdirOrEmpty(dataDirectory)) {
            if (!isDocumentFileName(entry)) continue
            const source = join(dataDirectory, entry)
            try {
              if (source === temporaryDocumentPath) {
                // The next save rewrites the temporary file in place, so it is copied with its time.
                await copyFile(source, join(snapshot, entry))
                const { atimeMs, mtimeMs } = await stat(source)
                await utimes(join(snapshot, entry), atimeMs / 1000, mtimeMs / 1000)
              } else {
                // Saves only rename the other document files, so a link keeps their bytes and times.
                await link(source, join(snapshot, entry))
              }
            } catch (error) {
              if (!isNotFound(error)) throw error
            }
          }
        } catch (error) {
          try {
            await removeOwnedDirectory(exportDirectory, snapshot)
          } catch {
            // The original failure is the one to report; the next start sweeps the directory.
          }
          throw error
        }
        return snapshot
      })
    },
    async releaseSnapshot(path) {
      await removeOwnedDirectory(archiveLayout().exportDirectory, path)
    },
    pinAttachments(ids) {
      const set = new Set(ids)
      pinned.add(set)
      return () => {
        pinned.delete(set)
      }
    },
  }

  function ownedName(parent: string, path: string): string {
    const name = basename(path)
    if (join(parent, name) !== path || !active.has(name)) {
      throw new Error('The directory was not created by this application session.')
    }
    return name
  }

  async function removeOwnedDirectory(parent: string, path: string): Promise<void> {
    const name = ownedName(parent, path)
    await nodeReplacementFileSystem.remove(path)
    active.delete(name)
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
    // Without an old-enough generation, the age rule cannot select a safety copy, so keep the newest MAX_RETAINED_GENERATIONS.
    // The autosave cadence makes this fallback unreachable during ordinary editing.
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
  if (!isValidAttachmentId(id)) {
    throw new Error('Attachment IDs may contain only letters, numbers, underscores, and hyphens.')
  }
  return join(attachmentsDirectory, `${id}.png`)
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function readdirOrEmpty(directory: string): Promise<string[]> {
  try {
    return await readdir(directory)
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
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

export type NewestDocument = { readonly path: string; readonly value: unknown } | { readonly error: unknown }

/**
 * Selects the newest stored document that validates among a directory's primary, interrupted-save,
 * legacy backup and generation files (PRODUCT §16.1). Returns null when none exists, or the first
 * real failure when none validates. Loading promotes the result; export reads it from a snapshot.
 */
export async function findNewestValidDocument(directory: string): Promise<NewestDocument | null> {
  const documentPath = join(directory, 'document.json')
  const temporaryDocumentPath = join(directory, 'document.json.tmp')
  const candidates = await listLoadCandidates(directory, documentPath, temporaryDocumentPath)
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
    return { error: new Error('The saved document has an unsupported format.') }
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
    return { path: candidate.path, value: read.value }
  }
  if (firstError !== undefined) return { error: firstError }
  return null
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
