import { startFolderBackup, type FolderBackup } from '../../application/folder-backup'
import { folderDestination } from '../backup/folder-destination'
import { BLOB_STORE, DOCUMENT_STORE, HEAD_KEY, openDatabase, readValue } from '../storage-schema'
import { backupFailure, type BackupWorkerMessage, type BackupWorkerRequest } from './backup-protocol'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BackupWorkerRequest>) => void) | null
  postMessage(message: BackupWorkerMessage): void
}
let backup: FolderBackup | undefined
let starting = false
let savedWhileStarting = false

scope.onmessage = async ({ data }) => {
  if (data?.type === 'saved') {
    if (starting) savedWhileStarting = true
    backup?.saved()
    return
  }
  if (data?.type !== 'start' || starting || backup) return
  starting = true
  try {
    const db = await openDatabase()
    db.onversionchange = () => {
      backup?.stop()
      db.close()
    }
    backup = startFolderBackup(
      {
        readHead: () => readValue(db, DOCUMENT_STORE, HEAD_KEY),
        readImage: (id) => readValue(db, BLOB_STORE, id),
      },
      folderDestination(data.folder),
      {
        now: () => performance.now(),
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      (state) => scope.postMessage(state.state === 'failed' ? backupFailure(state.error) : state),
    )
    if (savedWhileStarting) backup.saved()
  } catch (error) {
    scope.postMessage({ state: 'stopped', message: backupFailure(error).message })
  } finally {
    starting = false
  }
}
