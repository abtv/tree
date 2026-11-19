export const pageAdmissionLock = (scope: string) => `tree-offline:${scope}:page-admission`
export const updatingPageMessage = 'Tree is updating. Reload this tab after the update.'
export const otherWindowsMessage = 'Close other Tree tabs and windows, then try Update App again.'
export const reopenUpdateMessage = 'Your notes are saved. Close all Tree tabs and reopen Tree to finish updating.'
export const updateResponseTimeout = 15_000

export function enterBrowserPage<T>(open: () => Promise<T>): Promise<T> {
  if (!import.meta.env.PROD || !navigator.locks) return open()
  return navigator.locks.request(
    pageAdmissionLock(new URL('.', document.baseURI).href),
    { mode: 'shared', ifAvailable: true },
    (lock) => {
      if (!lock) throw new Error(updatingPageMessage)
      return open()
    },
  )
}
