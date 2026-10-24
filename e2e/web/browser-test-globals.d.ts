import type { EditorSnapshot } from '../../src/application/editor-store-types'
import type { EditorStore } from '../../src/application/editor-store'
import type { TreeApi } from '../../src/shared/ipc'

declare global {
  // Tests assert readiness before reading fields that exist only in the ready snapshot.
  type ReadyEditorSnapshot = Extract<EditorSnapshot, { status: 'ready' }>

  interface Window {
    prototypeStore: EditorStore
    treeApi: TreeApi
    backupPickerCalls: number
    backupFolderName: string
    backupPickerOptions: Parameters<NonNullable<Window['showDirectoryPicker']>>[0]
    backupRequests: number
    backupPermission: PermissionState
    originalClipboardWrite: Clipboard['write']
    copiedBytes: number[] | string[]
    copyActivation: boolean
    copyImage: (attachmentId: string) => Promise<string>
    nativeEditingField: HTMLElement
    programmaticReads: number
    nativePastes: number
    persistCalls: number
    restoreQuitFlush: () => void
    quitCloseCalls: number
    closeCalls: number
    storageTest: { fail: boolean; writes: number }
    shortcutEvents: { key: string; prevented: boolean }[]
    pastePrevented: boolean
    openedLinks: (string | URL | undefined)[]
    archivePerf: { longTasks: number[] }
    backupMeasurements: {
      writes: { name: string; bytes: number; time: number }[]
      paints: number[]
      saves: number[]
    }
  }
}
