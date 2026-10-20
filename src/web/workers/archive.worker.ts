import { exportFailureMessage, runExportJob } from '../archive/export-job'
import { BLOB_STORE, DOCUMENT_STORE, HEAD_KEY, openDatabase, readValue } from '../storage-schema'
import type { ArchiveWorkerMessage, ArchiveWorkerRequest } from './archive-protocol'

// The browser project compiles with the DOM library; declare the worker scope members used here
// instead of adding the conflicting WebWorker library.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ArchiveWorkerRequest>) => void) | null
  postMessage(message: ArchiveWorkerMessage, transfer: Transferable[]): void
}

// One worker runs one operation; the page terminates it to cancel (ADR 0022).
scope.onmessage = async (event) => {
  if (event.data?.type !== 'export') return
  const post = (message: ArchiveWorkerMessage, transfer: Transferable[] = []) => scope.postMessage(message, transfer)
  let db: IDBDatabase
  try {
    db = await openDatabase()
  } catch (error) {
    post({ type: 'error', message: exportFailureMessage(error) })
    return
  }
  try {
    await runExportJob(
      {
        readHead: () => readValue(db, DOCUMENT_STORE, HEAD_KEY),
        readImage: (id) => readValue(db, BLOB_STORE, id),
      },
      post,
    )
  } finally {
    db.close()
  }
}
