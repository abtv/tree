export type BackupWorkerRequest =
  { readonly type: 'start'; readonly folder: FileSystemDirectoryHandle } | { readonly type: 'saved' }

export const backupSavedMessage = (): BackupWorkerRequest => ({ type: 'saved' })

export type BackupFailure = 'permission' | 'not-found' | 'quota' | 'other'
export type BackupWorkerMessage =
  | { readonly state: 'stopped'; readonly message: string }
  | { readonly state: 'writing' }
  | { readonly state: 'saved'; readonly missingImages: number }
  | { readonly state: 'failed'; readonly kind: BackupFailure; readonly message: string }

export function backupFailure(error: unknown): Extract<BackupWorkerMessage, { state: 'failed' }> {
  const name = error instanceof Error ? error.name : ''
  return {
    state: 'failed',
    kind:
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'permission'
        : name === 'NotFoundError'
          ? 'not-found'
          : name === 'QuotaExceededError'
            ? 'quota'
            : 'other',
    message: error instanceof Error ? error.message : String(error),
  }
}
