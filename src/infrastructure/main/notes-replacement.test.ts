import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  commitReplacement,
  isDocumentFileName,
  nodeReplacementFileSystem,
  notesLayout,
  recoverReplacement,
  replacedFolderName,
  ReplacementIncompleteError,
  type NotesLayout,
  type ReplacementFileSystem,
} from './notes-replacement'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const NOW = new Date(2026, 9, 23, 14, 5, 9)
const FOLDER = '2026-10-23 14-05-09'

async function userData(): Promise<NotesLayout> {
  const root = await mkdtemp(join(tmpdir(), 'tree-notes-replacement-'))
  roots.push(root)
  const data = join(root, 'data')
  await mkdir(join(data, 'attachments'), { recursive: true })
  await writeFile(join(data, 'appearance.json'), '"dark"')
  await writeFile(join(data, 'window-bounds.json'), '{"width":800}')
  return notesLayout(root, data)
}

async function seedOldNotes(layout: NotesLayout): Promise<void> {
  for (const name of [
    'document.json',
    'document.json.tmp',
    'document.json.bak',
    'document.3.json',
    'document.4.json',
  ]) {
    await writeFile(join(layout.dataDirectory, name), `old ${name}`)
  }
  await writeFile(join(layout.dataDirectory, 'attachments', 'old.png'), 'old image')
}

async function stage(layout: NotesLayout, name = 'staged'): Promise<string> {
  const directory = join(layout.importDirectory, name)
  await mkdir(join(directory, 'attachments'), { recursive: true })
  await writeFile(join(directory, 'document.json'), 'new document')
  await writeFile(join(directory, 'attachments', 'new.png'), 'new image')
  return name
}

async function sortedEntries(path: string): Promise<string[]> {
  return (await readdir(path)).sort()
}

describe('notes replacement', () => {
  it('recognizes every document file and names the folder in local time', () => {
    for (const name of ['document.json', 'document.json.tmp', 'document.json.bak', 'document.12.json']) {
      expect(isDocumentFileName(name)).toBe(true)
    }
    for (const name of ['appearance.json', 'document.json.tmp.old', 'document.x.json', 'attachments']) {
      expect(isDocumentFileName(name)).toBe(false)
    }
    expect(replacedFolderName(NOW)).toBe(FOLDER)
  })

  it('moves every previous document file and image into Replaced Notes and keeps preferences', async () => {
    const layout = await userData()
    await seedOldNotes(layout)
    const before = {
      document: (await stat(join(layout.dataDirectory, 'document.json'))).ino,
      attachments: (await stat(join(layout.dataDirectory, 'attachments'))).ino,
    }
    const staged = await stage(layout)

    const folder = await commitReplacement(nodeReplacementFileSystem, layout, staged, NOW)

    expect(folder).toBe(join(layout.replacedNotesDirectory, FOLDER))
    expect(await sortedEntries(folder!)).toEqual([
      'attachments',
      'document.3.json',
      'document.4.json',
      'document.json',
      'document.json.bak',
      'document.json.tmp',
    ])
    expect(await readFile(join(folder!, 'attachments', 'old.png'), 'utf8')).toBe('old image')
    // Moved, not copied: the same files now live in the folder.
    expect((await stat(join(folder!, 'document.json'))).ino).toBe(before.document)
    expect((await stat(join(folder!, 'attachments'))).ino).toBe(before.attachments)
    expect(await sortedEntries(layout.dataDirectory)).toEqual([
      'appearance.json',
      'attachments',
      'document.json',
      'window-bounds.json',
    ])
    expect(await readFile(join(layout.dataDirectory, 'document.json'), 'utf8')).toBe('new document')
    expect(await sortedEntries(join(layout.dataDirectory, 'attachments'))).toEqual(['new.png'])
    expect(await readFile(join(layout.dataDirectory, 'appearance.json'), 'utf8')).toBe('"dark"')
    expect(await readFile(join(layout.dataDirectory, 'window-bounds.json'), 'utf8')).toBe('{"width":800}')
    expect(await readdir(layout.importDirectory)).toEqual([])
  })

  it('adds a number when a Replaced Notes folder of that time exists', async () => {
    const layout = await userData()
    await mkdir(join(layout.replacedNotesDirectory, FOLDER), { recursive: true })
    await mkdir(join(layout.replacedNotesDirectory, `${FOLDER} 2`))
    await seedOldNotes(layout)

    const folder = await commitReplacement(nodeReplacementFileSystem, layout, await stage(layout), NOW)

    expect(folder).toBe(join(layout.replacedNotesDirectory, `${FOLDER} 3`))
    expect(await readdir(join(layout.replacedNotesDirectory, FOLDER))).toEqual([])
  })

  it('creates no folder when there were no previous notes', async () => {
    const layout = await userData()

    const folder = await commitReplacement(nodeReplacementFileSystem, layout, await stage(layout), NOW)

    expect(folder).toBeNull()
    await expect(stat(layout.replacedNotesDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await sortedEntries(join(layout.dataDirectory, 'attachments'))).toEqual(['new.png'])
  })

  it('replaces the notes of a new profile that has no data directory yet', async () => {
    const layout = await userData()
    await rm(layout.dataDirectory, { recursive: true })

    const folder = await commitReplacement(nodeReplacementFileSystem, layout, await stage(layout), NOW)

    expect(folder).toBeNull()
    expect(await sortedEntries(layout.dataDirectory)).toEqual(['attachments', 'document.json'])
  })

  it('keeps images that no document file references in the Replaced Notes folder', async () => {
    const layout = await userData()
    await writeFile(join(layout.dataDirectory, 'attachments', 'orphan.png'), 'orphan')

    const folder = await commitReplacement(nodeReplacementFileSystem, layout, await stage(layout), NOW)

    expect(await readFile(join(folder!, 'attachments', 'orphan.png'), 'utf8')).toBe('orphan')
  })

  it('refuses an incomplete staging directory and changes nothing', async () => {
    const layout = await userData()
    await seedOldNotes(layout)
    await mkdir(join(layout.importDirectory, 'partial'), { recursive: true })
    await writeFile(join(layout.importDirectory, 'partial', 'document.json'), 'new document')

    await expect(commitReplacement(nodeReplacementFileSystem, layout, 'partial', NOW)).rejects.toThrow(
      'The prepared notes are incomplete.',
    )
    expect(await readFile(join(layout.dataDirectory, 'document.json'), 'utf8')).toBe('old document.json')
    expect(await sortedEntries(layout.importDirectory)).toEqual(['partial'])
  })

  it('leaves the notes and staging unchanged when the journal cannot be written', async () => {
    const layout = await userData()
    await seedOldNotes(layout)
    const staged = await stage(layout)
    const failing: ReplacementFileSystem = {
      ...nodeReplacementFileSystem,
      async rename(from, to) {
        if (from.endsWith('commit.json.tmp')) throw new Error('disk full')
        await nodeReplacementFileSystem.rename(from, to)
      },
    }

    const failure = await commitReplacement(failing, layout, staged, NOW).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(ReplacementIncompleteError)
    expect(await sortedEntries(layout.importDirectory)).toEqual(['staged'])
    expect(await readFile(join(layout.dataDirectory, 'document.json'), 'utf8')).toBe('old document.json')
  })

  it('reports a failure after the journal as incomplete and completes it on recovery', async () => {
    const layout = await userData()
    await seedOldNotes(layout)
    const staged = await stage(layout)
    const failing: ReplacementFileSystem = {
      ...nodeReplacementFileSystem,
      async rename(from, to) {
        if (from.endsWith(join('staged', 'document.json'))) throw new Error('interrupted')
        await nodeReplacementFileSystem.rename(from, to)
      },
    }

    await expect(commitReplacement(failing, layout, staged, NOW)).rejects.toBeInstanceOf(ReplacementIncompleteError)
    const recovery = await recoverReplacement(nodeReplacementFileSystem, layout, new Set())

    expect(recovery).toEqual({ completed: true, replacedFolder: join(layout.replacedNotesDirectory, FOLDER) })
    expect(await readFile(join(layout.dataDirectory, 'document.json'), 'utf8')).toBe('new document')
    expect(await readdir(layout.importDirectory)).toEqual([])
  })

  it('removes staging and snapshots that no running operation owns', async () => {
    const layout = await userData()
    await stage(layout, 'abandoned')
    await stage(layout, 'running')
    await writeFile(join(layout.importDirectory, 'commit.json.tmp'), '{')
    await mkdir(join(layout.exportDirectory, 'old-snapshot'), { recursive: true })
    await mkdir(join(layout.exportDirectory, 'current-snapshot'))

    const recovery = await recoverReplacement(
      nodeReplacementFileSystem,
      layout,
      new Set(['running', 'current-snapshot']),
    )

    expect(recovery).toEqual({ completed: false, replacedFolder: null })
    expect(await readdir(layout.importDirectory)).toEqual(['running'])
    expect(await readdir(layout.exportDirectory)).toEqual(['current-snapshot'])
  })

  it('refuses a damaged journal without changing the notes', async () => {
    const layout = await userData()
    await seedOldNotes(layout)
    await stage(layout)
    for (const journal of ['{', '{"staging":"../data","replaced":"x"}', '{"staging":"staged"}']) {
      await writeFile(join(layout.importDirectory, 'commit.json'), journal)
      await expect(recoverReplacement(nodeReplacementFileSystem, layout, new Set())).rejects.toThrow(
        'The import journal is damaged.',
      )
    }
    expect(await readFile(join(layout.dataDirectory, 'document.json'), 'utf8')).toBe('old document.json')
  })
})
