import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Replaces the desktop notes with imported notes as one crash-safe unit (ADR 0024, PRODUCT §25.4).
 * The previous document files and images move into a Replaced Notes folder; preferences stay.
 */

export interface NotesLayout {
  readonly userDataDirectory: string
  readonly dataDirectory: string
  readonly importDirectory: string
  readonly exportDirectory: string
  readonly replacedNotesDirectory: string
}

export function notesLayout(userDataDirectory: string, dataDirectory: string): NotesLayout {
  return {
    userDataDirectory,
    dataDirectory,
    importDirectory: join(userDataDirectory, '.notes-import'),
    exportDirectory: join(userDataDirectory, '.notes-export'),
    replacedNotesDirectory: join(userDataDirectory, 'Replaced Notes'),
  }
}

/** File-system operations the replacement uses; tests inject failures through this port. */
export interface ReplacementFileSystem {
  rename(from: string, to: string): Promise<void>
  mkdir(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  readFile(path: string): Promise<string>
  writeDurableFile(path: string, contents: string): Promise<void>
  syncDirectory(path: string): Promise<void>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export const nodeReplacementFileSystem: ReplacementFileSystem = {
  rename,
  async mkdir(path) {
    await mkdir(path, { recursive: true })
  },
  readdir: (path) => readdir(path),
  readFile: (path) => readFile(path, 'utf8'),
  async writeDurableFile(path, contents) {
    const file = await open(path, 'w')
    try {
      await file.writeFile(contents, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
  },
  async syncDirectory(path) {
    const file = await open(path, 'r')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
  async exists(path) {
    try {
      await stat(path)
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  },
}

/** Raised when a replacement fails after its journal exists; only roll-forward can follow. */
export class ReplacementIncompleteError extends Error {
  constructor(cause: unknown) {
    super(messageOf(cause), { cause })
    this.name = 'ReplacementIncompleteError'
  }
}

interface ReplacementJournal {
  readonly staging: string
  readonly replaced: string
  /** The imported archive's file name, so a completed recovery can report it. */
  readonly archive?: string
}

const JOURNAL_NAME = 'commit.json'
const DOCUMENT_NAME = 'document.json'
const ATTACHMENTS_NAME = 'attachments'
const DOCUMENT_FILE_PATTERN = /^document\.(?:json|json\.tmp|json\.bak|\d+\.json)$/
// A single path segment that the layout created; rejects separators and dot segments.
const SEGMENT_PATTERN = /^(?!\.{1,2}$)[^/\\\0]+$/

/** The primary document, an interrupted save, a legacy backup, or a retained generation. */
export function isDocumentFileName(name: string): boolean {
  return DOCUMENT_FILE_PATTERN.test(name)
}

/** `YYYY-MM-DD HH-MM-SS` in local time; colons are not used because the Finder shows them as slashes. */
export function replacedFolderName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  )
}

async function chooseReplacedFolder(fs: ReplacementFileSystem, layout: NotesLayout, now: Date): Promise<string> {
  const base = replacedFolderName(now)
  if (!(await fs.exists(join(layout.replacedNotesDirectory, base)))) return base
  for (let suffix = 2; ; suffix += 1) {
    const name = `${base} ${suffix}`
    if (!(await fs.exists(join(layout.replacedNotesDirectory, name)))) return name
  }
}

/**
 * Commits a prepared staging directory, which holds `document.json` and `attachments/`. Returns the
 * Replaced Notes folder, or null when there were no previous notes to move. A failure before the
 * journal exists leaves the notes unchanged; a later one raises `ReplacementIncompleteError`.
 */
export async function commitReplacement(
  fs: ReplacementFileSystem,
  layout: NotesLayout,
  staging: string,
  now: Date,
  archive?: string,
): Promise<string | null> {
  const stagingDirectory = join(layout.importDirectory, staging)
  if (
    !(await fs.exists(join(stagingDirectory, DOCUMENT_NAME))) ||
    !(await fs.exists(join(stagingDirectory, ATTACHMENTS_NAME)))
  ) {
    throw new Error('The prepared notes are incomplete.')
  }
  // A durable journal must never name staged entries that a power loss could still drop.
  await fs.syncDirectory(join(stagingDirectory, ATTACHMENTS_NAME))
  await fs.syncDirectory(stagingDirectory)
  const journal: ReplacementJournal = {
    staging,
    replaced: await chooseReplacedFolder(fs, layout, now),
    ...(archive === undefined ? {} : { archive }),
  }
  const journalPath = join(layout.importDirectory, JOURNAL_NAME)
  const pendingJournalPath = `${journalPath}.tmp`
  try {
    await fs.writeDurableFile(pendingJournalPath, JSON.stringify(journal))
    await fs.rename(pendingJournalPath, journalPath)
  } catch (error) {
    await fs.remove(pendingJournalPath).catch(() => undefined)
    throw error
  }
  try {
    // The rename alone may not be durable yet; recovery treats a present journal as committed.
    await fs.syncDirectory(layout.importDirectory)
    return await completeReplacement(fs, layout, journal)
  } catch (error) {
    throw new ReplacementIncompleteError(error)
  }
}

/**
 * Moves the previous notes out and the staged notes in, then ends the journal. Every step checks
 * what is still to do, so running it again after an interruption finishes the same replacement.
 */
async function completeReplacement(
  fs: ReplacementFileSystem,
  layout: NotesLayout,
  journal: ReplacementJournal,
): Promise<string | null> {
  const stagingDirectory = join(layout.importDirectory, journal.staging)
  const stagedDocument = join(stagingDirectory, DOCUMENT_NAME)
  const stagedAttachments = join(stagingDirectory, ATTACHMENTS_NAME)
  const dataAttachments = join(layout.dataDirectory, ATTACHMENTS_NAME)
  const folder = join(layout.replacedNotesDirectory, journal.replaced)
  if (await fs.exists(stagedDocument)) {
    // A new profile may not have written anything to data/ yet.
    await fs.mkdir(layout.dataDirectory)
    await fs.syncDirectory(layout.userDataDirectory)
    // Until the staged document moves in, every document file in data/ belongs to the old notes.
    const oldDocuments = (await fs.readdir(layout.dataDirectory)).filter(isDocumentFileName)
    // The staged images move in before the document, so data/attachments is old while they wait.
    const oldAttachments = (await fs.exists(stagedAttachments)) && (await fs.exists(dataAttachments))
    const oldImages = oldAttachments ? (await fs.readdir(dataAttachments)).length > 0 : false
    // An existing folder means an interrupted run already moved part of the previous notes there.
    if (oldDocuments.length > 0 || oldImages || (await fs.exists(folder))) {
      await fs.mkdir(folder)
      await fs.syncDirectory(layout.userDataDirectory)
      for (const name of oldDocuments) await fs.rename(join(layout.dataDirectory, name), join(folder, name))
      if (oldAttachments) await fs.rename(dataAttachments, join(folder, ATTACHMENTS_NAME))
      await fs.syncDirectory(folder)
      await fs.syncDirectory(layout.replacedNotesDirectory)
    } else if (oldAttachments) {
      await fs.remove(dataAttachments)
    }
    if (await fs.exists(stagedAttachments)) await fs.rename(stagedAttachments, dataAttachments)
    // The staged document is the marker of unfinished work, so every earlier move must be durable
    // before it disappears from staging.
    await fs.syncDirectory(layout.dataDirectory)
    await fs.syncDirectory(stagingDirectory)
    await fs.rename(stagedDocument, join(layout.dataDirectory, DOCUMENT_NAME))
    await fs.syncDirectory(layout.dataDirectory)
  }
  await fs.remove(stagingDirectory)
  await fs.remove(join(layout.importDirectory, JOURNAL_NAME))
  await fs.syncDirectory(layout.importDirectory)
  return (await fs.exists(folder)) ? folder : null
}

export interface RecoveredReplacement {
  /** True when a journal was found and its replacement completed. */
  readonly completed: boolean
  readonly replacedFolder: string | null
  /** The archive file name that the journal recorded. */
  readonly archive?: string
}

/**
 * Runs before the notes load. Completes a replacement that a journal records; otherwise removes
 * staging and export snapshots that no running operation owns.
 */
export async function recoverReplacement(
  fs: ReplacementFileSystem,
  layout: NotesLayout,
  active: ReadonlySet<string>,
): Promise<RecoveredReplacement> {
  const journal = await readJournal(fs, layout)
  if (journal !== undefined) {
    const replacedFolder = await completeReplacement(fs, layout, journal)
    return { completed: true, replacedFolder, ...(journal.archive === undefined ? {} : { archive: journal.archive }) }
  }
  for (const directory of [layout.importDirectory, layout.exportDirectory]) {
    for (const name of await readdirOrEmpty(fs, directory)) {
      if (!active.has(name)) await fs.remove(join(directory, name))
    }
  }
  return { completed: false, replacedFolder: null }
}

async function readJournal(fs: ReplacementFileSystem, layout: NotesLayout): Promise<ReplacementJournal | undefined> {
  let contents: string
  try {
    contents = await fs.readFile(join(layout.importDirectory, JOURNAL_NAME))
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error('The import journal is damaged.')
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('staging' in value) ||
    !('replaced' in value) ||
    typeof value.staging !== 'string' ||
    typeof value.replaced !== 'string' ||
    !SEGMENT_PATTERN.test(value.staging) ||
    !SEGMENT_PATTERN.test(value.replaced) ||
    ('archive' in value && typeof value.archive !== 'string')
  ) {
    throw new Error('The import journal is damaged.')
  }
  const archive = 'archive' in value ? (value.archive as string) : undefined
  return { staging: value.staging, replaced: value.replaced, ...(archive === undefined ? {} : { archive }) }
}

async function readdirOrEmpty(fs: ReplacementFileSystem, path: string): Promise<string[]> {
  try {
    return await fs.readdir(path)
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
