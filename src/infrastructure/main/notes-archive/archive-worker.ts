import { parentPort, workerData } from 'node:worker_threads'
import type { ArchiveWorkerChannel, ArchiveWorkerReply, ArchiveWorkerTask } from './archive-worker-protocol'
import { runDesktopExport } from './desktop-export-job'
import { runDesktopImport } from './desktop-import-job'

// One worker runs one operation; the main process terminates it to cancel (ADR 0024).
const port = parentPort
if (port === null) throw new Error('The notes archive worker must run in a worker thread.')

let pendingReply: ((reply: ArchiveWorkerReply) => void) | undefined
port.on('message', (reply: ArchiveWorkerReply) => {
  const resolve = pendingReply
  pendingReply = undefined
  resolve?.(reply)
})

const channel: ArchiveWorkerChannel = {
  post: (message) => port.postMessage(message),
  // The jobs make one request at a time, so a single pending reply suffices.
  request: (message) =>
    new Promise((resolve) => {
      pendingReply = resolve
      port.postMessage(message)
    }),
}

const task = workerData as ArchiveWorkerTask
void (task.type === 'export' ? runDesktopExport(task, channel) : runDesktopImport(task, channel))
