import { NotesArchiveError } from './archive-policy'
import type { NotesArchiveSummary } from './export-notes'
import type { IncomingNotes, NotesCounts } from './import-notes'

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The reason an export failed: an archive rule's own message, otherwise the read failure. */
export function exportFailureMessage(error: unknown): string {
  if (error instanceof NotesArchiveError) return error.message
  return `The notes could not be read: ${reason(error)}`
}

/** A desktop export that could not write its file, as opposed to reading the notes (PRODUCT §25.2). */
export const archiveNotSavedMessage = (error: unknown) => `The archive could not be saved: ${reason(error)}`

/** The reason an import or folder restore failed: an archive rule's own message, otherwise the cause. */
export function importFailureMessage(error: unknown, fromFolder = false): string {
  if (error instanceof NotesArchiveError) return error.message
  return fromFolder
    ? `The notes could not be restored: ${reason(error)}`
    : `The archive could not be imported: ${reason(error)}`
}

const count = (value: number, singular: string, plural: string) =>
  `${value.toLocaleString('en-US')} ${value === 1 ? singular : plural}`

export function archiveFileName(now: Date): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `Tree Notes ${date}.zip`
}

function progressText(action: string, imagesDone: number, imageCount: number): string {
  if (imageCount === 0) return `${action} Notes…`
  return `${action} Notes… ${imagesDone.toLocaleString('en-US')} of ${count(imageCount, 'image', 'images')}`
}

export const exportProgressText = (imagesDone: number, imageCount: number) =>
  progressText('Exporting', imagesDone, imageCount)
export const importProgressText = (imagesDone: number, imageCount: number) =>
  progressText('Importing', imagesDone, imageCount)
export const restoreProgressText = (imagesDone: number, imageCount: number) =>
  progressText('Restoring', imagesDone, imageCount)

export function exportResultText(fileName: string, summary: NotesArchiveSummary): string {
  const exported = `Exported “${fileName}”.`
  if (summary.missingImageCount === 0) return exported
  const count = summary.missingImageCount.toLocaleString('en-US')
  return summary.missingImageCount === 1
    ? `${exported} 1 image could not be found and was not included.`
    : `${exported} ${count} images could not be found and were not included.`
}

/** Formats a file size in decimal units, as the Finder does. */
export function fileSizeText(bytes: number): string {
  if (bytes < 1000) return count(bytes, 'byte', 'bytes')
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 999.95 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 100 ? 1 : 0 })} ${units[unit]}`
}

const notesText = (notes: NotesCounts) =>
  `${count(notes.nodeCount, 'node', 'nodes')} and ${count(notes.imageCount, 'image', 'images')}`

export interface ImportConfirmationText {
  readonly incoming: string
  readonly current: string
  readonly missing: string | undefined
}

export function importConfirmationText(
  fileName: string,
  fileBytes: number,
  incoming: IncomingNotes,
  current: NotesCounts | 'none' | 'invalid',
  restoring = false,
): ImportConfirmationText {
  const action = restoring ? 'Restoring' : 'Importing'
  return {
    incoming: `“${fileName}” (${fileSizeText(fileBytes)}) contains ${notesText(incoming)}.`,
    current:
      current === 'none'
        ? 'There are no saved notes in this browser.'
        : current === 'invalid'
          ? `The notes saved in this browser are invalid and cannot be opened. ${action} replaces them.`
          : `Your current notes have ${notesText(current)}. ${action} replaces them, and this cannot be undone.`,
    missing:
      incoming.missingImageCount === 0
        ? undefined
        : incoming.missingImageCount === 1
          ? `1 image that the notes use is not in the ${restoring ? 'folder' : 'archive'}. Its node will show “Image could not be loaded.”`
          : `${incoming.missingImageCount.toLocaleString('en-US')} images that the notes use are not in the ${restoring ? 'folder' : 'archive'}. Their nodes will show “Image could not be loaded.”`,
  }
}

/** Desktop replacement preserves the old files rather than deleting them (§25.3). */
export function desktopImportConfirmationText(
  fileName: string,
  fileBytes: number,
  incoming: IncomingNotes,
  current: NotesCounts | 'none' | 'invalid',
): ImportConfirmationText {
  return {
    ...importConfirmationText(fileName, fileBytes, incoming, current),
    current:
      current === 'none'
        ? 'There are no saved notes.'
        : current === 'invalid'
          ? 'The saved notes cannot be opened. Importing replaces them and moves their files to the Replaced Notes folder.'
          : `Your current notes have ${notesText(current)}. Importing replaces them and moves them to the Replaced Notes folder.`,
  }
}
