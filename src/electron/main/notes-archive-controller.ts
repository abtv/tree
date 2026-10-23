import { randomUUID } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import {
  archiveFileName,
  archiveNotSavedMessage,
  exportFailureMessage,
  importFailureMessage,
} from '../../application/notes-archive/archive-messages'
import type { FileServices, NotesArchiveFileServices } from '../../infrastructure/main/file-services'
import type {
  ArchiveWorkerMessage,
  ArchiveWorkerReply,
  ArchiveWorkerTask,
} from '../../infrastructure/main/notes-archive/archive-worker-protocol'
import { ReplacementIncompleteError } from '../../infrastructure/main/notes-replacement'
import type {
  NotesArchiveProgress,
  NotesExportResult,
  NotesFileChoice,
  NotesImportCommit,
  NotesImportNotice,
  NotesImportPreparation,
  NotesOperationCanceled,
} from '../../shared/ipc'
import type { PngDecoder } from './ipc-security'

/** The part of a `worker_threads` Worker that the controller uses. */
export interface ArchiveWorkerHandle {
  on(event: 'message', listener: (message: ArchiveWorkerMessage) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  postMessage(reply: ArchiveWorkerReply): void
  terminate(): Promise<unknown>
}

export interface FileDialogFilter {
  readonly name: string
  readonly extensions: string[]
}

/** Native panels, shown as sheets on the main window. */
export interface NotesArchiveDialogs {
  showSaveDialog(options: {
    defaultPath: string
    filters: FileDialogFilter[]
  }): Promise<{ canceled: boolean; filePath?: string }>
  showOpenDialog(options: {
    properties: Array<'openFile'>
    filters: FileDialogFilter[]
  }): Promise<{ canceled: boolean; filePaths: string[] }>
}

export interface NotesArchiveControllerDependencies {
  readonly fileServices: Pick<
    FileServices & NotesArchiveFileServices,
    | 'createStagingDirectory'
    | 'discardStagingDirectory'
    | 'replaceNotes'
    | 'takeRecoveredReplacement'
    | 'snapshotDocuments'
    | 'releaseSnapshot'
    | 'pinAttachments'
  >
  readonly attachmentsDirectory: string
  readonly dialogs: NotesArchiveDialogs
  startWorker(task: ArchiveWorkerTask): ArchiveWorkerHandle
  readonly decodePng: PngDecoder
  sendProgress(progress: NotesArchiveProgress): void
  showItemInFolder(path: string): void
  readonly homeDirectory: string
  readonly now?: () => Date
}

export interface NotesArchiveController {
  chooseExportDestination(): Promise<NotesFileChoice>
  startExport(): Promise<NotesExportResult>
  chooseImportArchive(): Promise<NotesFileChoice>
  prepareImport(): Promise<NotesImportPreparation>
  commitImport(): Promise<NotesImportCommit>
  cancel(): Promise<void>
  takeImportNotice(): NotesImportNotice | null
  showReplacedFolder(): void
  /** Cancels export and import preparation and waits for a running replacement; null when idle. */
  shutdown(): Promise<void> | null
}

export const WORKER_STOPPED_MESSAGE = 'The notes archive worker stopped unexpectedly.'
export const BUSY_MESSAGE = 'Another notes export or import is running.'
export const RESTART_REQUIRED_MESSAGE = 'Restart Tree to complete the notes import.'

const ZIP_FILTERS: FileDialogFilter[] = [{ name: 'ZIP Archive', extensions: ['zip'] }]
const CANCELED: NotesOperationCanceled = { ok: false, canceled: true }

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'choosing' }
  | { readonly kind: 'export-chosen'; readonly path: string }
  | { readonly kind: 'import-chosen'; readonly path: string }
  | { readonly kind: 'running'; readonly operation: object; cancel(): Promise<void> }
  | { readonly kind: 'prepared'; readonly staging: string; readonly fileName: string }
  | { readonly kind: 'committing'; readonly done: Promise<unknown> }

type WorkerOutcome<T> = { readonly value: T } | { readonly crash: unknown }

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))
const ignore = () => undefined

/**
 * Runs desktop notes export and import (PRODUCT §25, ADR 0024). Paths come only from the native
 * panels and stay in this process; one worker per operation does the archive work, and this
 * controller answers its requests, renames a finished export into place and commits an import.
 */
export function createNotesArchiveController(dependencies: NotesArchiveControllerDependencies): NotesArchiveController {
  const { fileServices, dialogs } = dependencies
  const now = dependencies.now ?? (() => new Date())
  let state: State = { kind: 'idle' }
  let closing = false
  let restartRequired = false
  let notice: { fileName?: string; folder: string | null } | undefined
  let replacedFolder: string | null = null

  const beginChoice = (): void => {
    if (closing) throw new Error('Tree is quitting.')
    if (restartRequired) throw new Error(RESTART_REQUIRED_MESSAGE)
    if (state.kind !== 'idle' && state.kind !== 'export-chosen' && state.kind !== 'import-chosen') {
      throw new Error(BUSY_MESSAGE)
    }
    state = { kind: 'choosing' }
  }

  const take = <K extends State['kind']>(kind: K, missing: string): Extract<State, { kind: K }> => {
    if (state.kind !== kind) throw new Error(missing)
    return state as Extract<State, { kind: K }>
  }

  /** Answers the worker's requests in order until `handle` returns a final value. */
  const supervise = <T>(
    worker: ArchiveWorkerHandle,
    handle: (message: ArchiveWorkerMessage, reply: (reply: ArchiveWorkerReply) => void) => Promise<T | undefined>,
  ): {
    readonly outcome: Promise<WorkerOutcome<T>>
    terminate(): Promise<void>
    /**
     * Resolves when the worker thread has stopped and no request is being answered, so cleanup
     * sees every file that the worker or a handler created.
     */
    stopped(): Promise<void>
  } => {
    let settled = false
    let stopping: Promise<void> | undefined
    const stop = () => (stopping ??= worker.terminate().then(ignore, ignore))
    let resolveOutcome: (outcome: WorkerOutcome<T>) => void = ignore
    const outcome = new Promise<WorkerOutcome<T>>((resolve) => {
      resolveOutcome = resolve
    })
    const finish = (result: WorkerOutcome<T>) => {
      if (settled) return
      settled = true
      resolveOutcome(result)
      void stop()
    }
    let queue = Promise.resolve()
    worker.on('message', (message) => {
      queue = queue.then(async () => {
        if (settled) return
        try {
          const value = await handle(message, (reply) => {
            if (!settled) worker.postMessage(reply)
          })
          if (value !== undefined) finish({ value })
        } catch (error) {
          finish({ crash: error })
        }
      })
    })
    worker.on('error', (error) => finish({ crash: error }))
    worker.on('exit', () => finish({ crash: new Error(WORKER_STOPPED_MESSAGE) }))
    return {
      outcome,
      async terminate() {
        finish({ crash: new Error('Cancelled.') })
        await stop()
      },
      async stopped() {
        await stop()
        await queue
      },
    }
  }

  /** Runs `body` as the current operation; `cancel` terminates its worker and waits for its cleanup. */
  const runOperation = <T>(
    body: (isCanceled: () => boolean, setWorker: (terminate: () => Promise<void>) => void) => Promise<T>,
  ): Promise<T> => {
    const operation = {}
    let canceled = false
    let terminate: () => Promise<void> = async () => undefined
    const finished = body(
      () => canceled,
      (stop) => {
        terminate = stop
      },
    ).finally(() => {
      if (state.kind === 'running' && state.operation === operation) state = { kind: 'idle' }
    })
    state = {
      kind: 'running',
      operation,
      async cancel() {
        canceled = true
        await terminate()
        await finished.catch(ignore)
      },
    }
    return finished
  }

  const cancel = async (): Promise<void> => {
    const current = state
    switch (current.kind) {
      case 'export-chosen':
      case 'import-chosen':
        state = { kind: 'idle' }
        return
      case 'running':
        await current.cancel()
        return
      case 'prepared':
        state = { kind: 'idle' }
        await fileServices.discardStagingDirectory(current.staging).catch(ignore)
        return
      default:
        // A native panel cannot be closed from here, and a running replacement must finish.
        return
    }
  }

  return {
    async chooseExportDestination() {
      beginChoice()
      try {
        const result = await dialogs.showSaveDialog({ defaultPath: archiveFileName(now()), filters: ZIP_FILTERS })
        if (closing || result.canceled || result.filePath === undefined || result.filePath === '') {
          state = { kind: 'idle' }
          return CANCELED
        }
        state = { kind: 'export-chosen', path: result.filePath }
        return { ok: true, fileName: basename(result.filePath) }
      } catch (error) {
        state = { kind: 'idle' }
        throw error
      }
    },

    async startExport() {
      const destination = take('export-chosen', 'No export destination was chosen.').path
      const fileName = basename(destination)
      const directory = dirname(destination)
      // Hidden and unique beside the destination, so the final rename stays on one volume.
      const temporaryPath = join(directory, `.${[...fileName].slice(0, 50).join('')}.${randomUUID().slice(0, 8)}.tmp`)
      return runOperation<NotesExportResult>(async (isCanceled, setWorker) => {
        let snapshot: string | undefined
        let unpin: () => void = ignore
        let stopped: () => Promise<void> = async () => undefined
        try {
          snapshot = await fileServices.snapshotDocuments()
          if (isCanceled()) return CANCELED
          const run = supervise<{ written: NotesExportResult } | { failed: string }>(
            dependencies.startWorker({
              type: 'export',
              snapshotDirectory: snapshot,
              attachmentsDirectory: dependencies.attachmentsDirectory,
              temporaryPath,
            }),
            async (message, reply) => {
              switch (message.type) {
                case 'progress':
                  dependencies.sendProgress({ imagesDone: message.imagesDone, imageCount: message.imageCount })
                  return undefined
                case 'pin':
                  unpin()
                  unpin = fileServices.pinAttachments(message.ids)
                  reply({ type: 'pinned' })
                  return undefined
                case 'written':
                  return { written: { ok: true, fileName, summary: message.summary } }
                case 'error':
                  return { failed: message.message }
                default:
                  throw new Error(`Unexpected archive worker message: ${message.type}.`)
              }
            },
          )
          setWorker(run.terminate)
          stopped = run.stopped
          const outcome = await run.outcome
          if (isCanceled()) return CANCELED
          if ('crash' in outcome) return { ok: false, message: exportFailureMessage(outcome.crash) }
          if ('failed' in outcome.value) return { ok: false, message: outcome.value.failed }
          // Past this point the archive is complete, so a later cancel no longer removes it.
          try {
            await rename(temporaryPath, destination)
          } catch (error) {
            return { ok: false, message: archiveNotSavedMessage(error) }
          }
          // The complete archive is already in place; a volume that cannot flush a directory keeps it.
          await syncDirectory(directory).catch(ignore)
          return outcome.value.written
        } catch (error) {
          return { ok: false, message: exportFailureMessage(error) }
        } finally {
          // A terminated worker may still finish a file operation, so cleanup waits until it stopped.
          await stopped()
          unpin()
          await rm(temporaryPath, { force: true }).catch(ignore)
          if (snapshot !== undefined) await fileServices.releaseSnapshot(snapshot).catch(ignore)
        }
      })
    },

    async chooseImportArchive() {
      beginChoice()
      try {
        const result = await dialogs.showOpenDialog({ properties: ['openFile'], filters: ZIP_FILTERS })
        const path = result.filePaths[0]
        if (closing || result.canceled || path === undefined) {
          state = { kind: 'idle' }
          return CANCELED
        }
        state = { kind: 'import-chosen', path }
        return { ok: true, fileName: basename(path) }
      } catch (error) {
        state = { kind: 'idle' }
        throw error
      }
    },

    async prepareImport() {
      const archivePath = take('import-chosen', 'No archive was chosen.').path
      const fileName = basename(archivePath)
      return runOperation<NotesImportPreparation>(async (isCanceled, setWorker) => {
        let staging: string | undefined
        let snapshot: string | undefined
        let stopped: () => Promise<void> = async () => undefined
        try {
          staging = await fileServices.createStagingDirectory()
          if (isCanceled()) return CANCELED
          const stagingDirectory = staging
          const run = supervise<NotesImportPreparation>(
            dependencies.startWorker({ type: 'import', archivePath, stagingDirectory }),
            async (message, reply) => {
              switch (message.type) {
                case 'progress':
                  dependencies.sendProgress({ imagesDone: message.imagesDone, imageCount: message.imageCount })
                  return undefined
                case 'validate-image':
                  reply({ type: 'image-validated', decodable: dependencies.decodePng(message.bytes) })
                  return undefined
                case 'staged':
                  snapshot = await fileServices.snapshotDocuments()
                  reply({ type: 'count', snapshotDirectory: snapshot })
                  return undefined
                case 'prepared':
                  return {
                    ok: true,
                    fileName,
                    fileBytes: message.fileBytes,
                    incoming: message.incoming,
                    current: message.current,
                  }
                case 'error':
                  return { ok: false, message: message.message }
                default:
                  throw new Error(`Unexpected archive worker message: ${message.type}.`)
              }
            },
          )
          setWorker(run.terminate)
          stopped = run.stopped
          const outcome = await run.outcome
          if (isCanceled()) return CANCELED
          if ('crash' in outcome) return { ok: false, message: importFailureMessage(outcome.crash) }
          if (outcome.value.ok) {
            // The confirmation decides; until then the staging directory waits for commit or cancel.
            state = { kind: 'prepared', staging: stagingDirectory, fileName }
            staging = undefined
          }
          return outcome.value
        } catch (error) {
          return { ok: false, message: importFailureMessage(error) }
        } finally {
          await stopped()
          if (snapshot !== undefined) await fileServices.releaseSnapshot(snapshot).catch(ignore)
          if (staging !== undefined) await fileServices.discardStagingDirectory(staging).catch(ignore)
        }
      })
    },

    async commitImport() {
      const { staging, fileName } = take('prepared', 'No import is prepared.')
      const done = (async (): Promise<NotesImportCommit> => {
        try {
          const folder = await fileServices.replaceNotes(staging, fileName)
          replacedFolder = folder
          notice = { fileName, folder }
          return { ok: true }
        } catch (error) {
          if (error instanceof ReplacementIncompleteError) {
            // The journal exists: only the next start can finish this replacement (ADR 0024).
            restartRequired = true
            return { ok: false, restartRequired: true, message: `Your notes could not be replaced: ${reason(error)}` }
          }
          await fileServices.discardStagingDirectory(staging).catch(ignore)
          return { ok: false, restartRequired: false, message: `Your notes could not be replaced: ${reason(error)}` }
        } finally {
          state = { kind: 'idle' }
        }
      })()
      state = { kind: 'committing', done }
      return done
    },

    cancel,

    takeImportNotice() {
      let taken = notice
      notice = undefined
      if (taken === undefined) {
        const recovered = fileServices.takeRecoveredReplacement()
        if (recovered !== undefined) {
          taken = {
            ...(recovered.archive === undefined ? {} : { fileName: recovered.archive }),
            folder: recovered.replacedFolder,
          }
        }
      }
      if (taken === undefined) return null
      if (taken.folder !== null) replacedFolder = taken.folder
      return {
        ...(taken.fileName === undefined ? {} : { fileName: taken.fileName }),
        replacedFolder: taken.folder === null ? null : displayPath(taken.folder, dependencies.homeDirectory),
      }
    },

    showReplacedFolder() {
      // Only a folder that this process created can be revealed; the renderer names none.
      if (replacedFolder === null) throw new Error('There is no Replaced Notes folder to show.')
      dependencies.showItemInFolder(replacedFolder)
    },

    shutdown() {
      closing = true
      const current = state
      if (current.kind === 'committing') return current.done.then(ignore)
      if (current.kind === 'running' || current.kind === 'prepared') return cancel()
      if (current.kind === 'export-chosen' || current.kind === 'import-chosen') state = { kind: 'idle' }
      return null
    },
  }
}

/** Abbreviates the home directory as `~`, as the Finder's Go to Folder accepts it. */
export function displayPath(path: string, homeDirectory: string): string {
  return path.startsWith(homeDirectory + sep) ? `~${path.slice(homeDirectory.length)}` : path
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}
