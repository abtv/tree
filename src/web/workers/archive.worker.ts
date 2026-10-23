import { exportFailureMessage, runExportJob } from '../archive/export-job'
import { createImportJob, importFailureMessage, type ImportJob } from '../archive/import-job'
import { blobArchiveFile } from '../archive/blob-archive-file'
import { folderSource } from '../archive/folder-source'
import { validatePngAttachment } from '../attachment-validation'
import {
  BLOB_STORE,
  DOCUMENT_STORE,
  HEAD_KEY,
  commitImportedHead,
  discardStagedImages,
  openDatabase,
  readValue,
  stageImage,
} from '../storage-schema'
import type { ArchiveWorkerMessage, ArchiveWorkerRequest } from './archive-protocol'

// The browser project compiles with the DOM library; declare the worker scope members used here
// instead of adding the conflicting WebWorker library.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ArchiveWorkerRequest>) => void) | null
  postMessage(message: ArchiveWorkerMessage, transfer: Transferable[]): void
}

const post = (message: ArchiveWorkerMessage, transfer: Transferable[] = []) => scope.postMessage(message, transfer)
let importJob: ImportJob | undefined

// One worker runs one operation; the page terminates it to cancel (ADR 0022).
scope.onmessage = async (event) => {
  const request = event.data
  if (request?.type === 'commit-import') {
    await importJob?.commit()
    return
  }
  if (request?.type !== 'export' && request?.type !== 'import' && request?.type !== 'restore') return
  let db: IDBDatabase
  try {
    db = await openDatabase()
  } catch (error) {
    post({
      type: 'error',
      message:
        request.type === 'export'
          ? exportFailureMessage(error)
          : importFailureMessage(error, request.type === 'restore'),
    })
    return
  }
  if (request.type === 'import' || request.type === 'restore') {
    // The connection stays open until the page commits the import or terminates the worker.
    importJob = createImportJob(
      {
        readHead: () => readValue(db, DOCUMENT_STORE, HEAD_KEY),
        writeHead: (head) => commitImportedHead(db, head),
        readImage: (id) => readValue(db, BLOB_STORE, id),
        writeImage: (id, bytes) => stageImage(db, id, bytes),
        // The journal lists exactly the images this import wrote.
        removeImages: () => discardStagedImages(db),
      },
      validatePngAttachment,
      post,
    )
    await importJob.prepare(request.type === 'import' ? blobArchiveFile(request.file) : folderSource(request.folder))
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
