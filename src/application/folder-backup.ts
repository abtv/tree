import { collectAttachmentIds, validatePersistedState } from '../domain/document'
import type { NotesArchiveSource } from './notes-archive/export-notes'
import { attachmentEntryName } from './notes-archive/archive-policy'

export const BACKUP_INTERVAL_MILLISECONDS = 10_000

/** The destination deliberately has no deletion operation (PRODUCT §24.5). */
export interface BackupDestination {
  listImages(): Promise<ReadonlySet<string>>
  writeImage(name: string, bytes: Uint8Array): Promise<void>
  writeDocument(text: string): Promise<void>
}

export type BackupState =
  | { readonly state: 'writing' }
  | { readonly state: 'saved'; readonly missingImages: number }
  | { readonly state: 'failed'; readonly error: unknown }

export interface BackupClock {
  now(): number
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

export interface FolderBackup {
  saved(): void
  stop(): void
}

/**
 * One startup copy, then coalesced saved versions, with one run in flight. A fixed deadline from
 * the first pending save prevents continuous editing from postponing the backup indefinitely.
 * Runs start at least one interval apart; I/O time can add to the lag. Failures retry at that
 * interval even without another edit. Only successfully closed image files enter the cache.
 */
export function startFolderBackup(
  source: NotesArchiveSource,
  destination: BackupDestination,
  clock: BackupClock,
  update: (state: BackupState) => void,
): FolderBackup {
  let stopped = false
  let running = false
  let pending = true
  let timer: unknown
  let lastStarted = -Infinity
  let names: Set<string> | undefined
  const foldedNames = new Set<string>()

  const schedule = () => {
    if (stopped || running || !pending || timer !== undefined) return
    timer = clock.setTimeout(
      () => {
        timer = undefined
        void run()
      },
      Math.max(0, lastStarted + BACKUP_INTERVAL_MILLISECONDS - clock.now()),
    )
  }
  const run = async () => {
    if (stopped) return
    running = true
    pending = false
    lastStarted = clock.now()
    update({ state: 'writing' })
    try {
      if (names === undefined) {
        names = new Set(await destination.listImages())
        for (const name of names) foldedNames.add(name.toLowerCase())
      }
      const head = await source.readHead()
      const ids = [...collectAttachmentIds(validatePersistedState(head).document)].sort()
      const text = JSON.stringify(head)
      let missingImages = 0
      for (const id of ids) {
        if (stopped) return
        const name = attachmentEntryName(id).slice('attachments/'.length)
        if (names.has(name)) continue
        if (foldedNames.has(name.toLowerCase())) {
          throw new Error(
            `“attachments/${name}” conflicts with an image name that differs only in letter case. Choose a different backup folder.`,
          )
        }
        const bytes = await source.readImage(id)
        if (stopped) return
        if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
          missingImages += 1
          continue
        }
        await destination.writeImage(name, bytes)
        names.add(name)
        foldedNames.add(name.toLowerCase())
      }
      if (stopped) return
      await destination.writeDocument(text)
      if (!stopped) update({ state: 'saved', missingImages })
    } catch (error) {
      pending = true
      if (!stopped) update({ state: 'failed', error })
    } finally {
      running = false
      schedule()
    }
  }
  schedule()
  return {
    saved() {
      pending = true
      schedule()
    },
    stop() {
      stopped = true
      if (timer !== undefined) clock.clearTimeout(timer)
      timer = undefined
    },
  }
}
