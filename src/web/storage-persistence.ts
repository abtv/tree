export type StorageProtection = 'protected' | 'unprotected' | 'unavailable'

type PersistentStorage = Pick<StorageManager, 'persisted' | 'persist'>

/**
 * Asks once per page load that the browser keep this origin's storage under
 * pressure (PRODUCT §24.1). A denial or failure changes nothing else.
 */
export async function requestPersistentStorage(
  storage: Partial<PersistentStorage> | undefined,
): Promise<StorageProtection> {
  if (typeof storage?.persisted !== 'function') return 'unavailable'
  try {
    if (await storage.persisted()) return 'protected'
  } catch {
    return 'unavailable'
  }
  if (typeof storage.persist !== 'function') return 'unprotected'
  try {
    return (await storage.persist()) ? 'protected' : 'unprotected'
  } catch {
    return 'unprotected'
  }
}

export function storageProtectionText(protection: StorageProtection): string | undefined {
  if (protection === 'protected') return 'Storage is protected from automatic clearing.'
  if (protection === 'unprotected') return 'Storage is not protected from automatic clearing.'
  return undefined
}
