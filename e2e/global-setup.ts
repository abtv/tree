import { removeStaleClipboardLock } from './clipboard-lock'
import { cleanupStaleElectronProcesses } from './electron-process'

// Runs once before any worker starts. A worker only cleans Electron processes carrying its own
// per-worker user-data marker, so leftovers from crashed earlier runs are cleaned here, before
// sibling workers exist and could be killed. Two concurrent Playwright invocations remain
// unsupported: this cleanup would terminate the other invocation's applications.
export default async function globalSetup(): Promise<void> {
  await cleanupStaleElectronProcesses('tree-e2e-')
  removeStaleClipboardLock()
}
