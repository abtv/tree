import fc from 'fast-check'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { propertyRuns } from '../../test/property-runs'
import {
  commitReplacement,
  nodeReplacementFileSystem,
  notesLayout,
  recoverReplacement,
  type NotesLayout,
  type ReplacementFileSystem,
} from './notes-replacement'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const NOW = new Date(2026, 9, 23, 14, 5, 9)
const DOCUMENT_NAMES = ['document.json', 'document.json.tmp', 'document.json.bak', 'document.1.json', 'document.7.json']

interface OldNotes {
  /** A new profile has no data directory at all. */
  readonly newProfile: boolean
  readonly documents: readonly string[]
  readonly images: number
}

async function fixture(old: OldNotes): Promise<NotesLayout> {
  const root = await mkdtemp(join(tmpdir(), 'tree-notes-replacement-property-'))
  roots.push(root)
  const layout = notesLayout(root, join(root, 'data'))
  if (!old.newProfile) {
    await mkdir(join(layout.dataDirectory, 'attachments'), { recursive: true })
    await writeFile(join(layout.dataDirectory, 'vim-enabled.json'), 'true')
    for (const name of old.documents) await writeFile(join(layout.dataDirectory, name), `old ${name}`)
    for (let index = 0; index < old.images; index += 1) {
      await writeFile(join(layout.dataDirectory, 'attachments', `old-${index}.png`), `old image ${index}`)
    }
  }
  const staging = join(layout.importDirectory, 'staged')
  await mkdir(join(staging, 'attachments'), { recursive: true })
  await writeFile(join(staging, 'document.json'), 'new document')
  await writeFile(join(staging, 'attachments', 'new.png'), 'new image')
  return layout
}

/** Every file below a directory with its contents; directories appear with a trailing slash. */
async function tree(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const visit = async (path: string) => {
    let names: string[]
    try {
      names = await readdir(path)
    } catch {
      return
    }
    for (const name of names) {
      const child = join(path, name)
      if ((await stat(child)).isDirectory()) {
        result[`${relative(directory, child)}/`] = ''
        await visit(child)
      } else {
        result[relative(directory, child)] = await readFile(child, 'utf8')
      }
    }
  }
  await visit(directory)
  return result
}

/** Fails the call with the given index and every later call, as a crash would stop all of them. */
function crashingFileSystem(crashAt: number): {
  fs: ReplacementFileSystem
  calls: () => number
  journalCommitted: () => boolean
} {
  let calls = 0
  let journalCommitted = false
  const guard = <A extends unknown[], R>(operation: (...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
      const index = calls
      calls += 1
      if (index >= crashAt) throw new Error('crashed')
      return operation(...args)
    }
  }
  const real = nodeReplacementFileSystem
  return {
    fs: {
      rename: guard(async (from: string, to: string) => {
        await real.rename(from, to)
        if (to.endsWith('commit.json')) journalCommitted = true
      }),
      mkdir: guard(real.mkdir),
      readdir: guard(real.readdir),
      readFile: guard(real.readFile),
      writeDurableFile: guard(real.writeDurableFile),
      syncDirectory: guard(real.syncDirectory),
      remove: guard(real.remove),
      exists: guard(real.exists),
    },
    calls: () => calls,
    journalCommitted: () => journalCommitted,
  }
}

const oldNotes = fc.oneof(
  fc.record({
    newProfile: fc.constant(false),
    documents: fc.subarray(DOCUMENT_NAMES),
    images: fc.integer({ min: 0, max: 2 }),
  }),
  fc.constant({ newProfile: true, documents: [], images: 0 }),
)

describe('notes replacement after a crash', () => {
  it('opens either the untouched previous notes or the complete imported notes', async () => {
    await fc.assert(
      fc.asyncProperty(oldNotes, fc.nat(), fc.nat({ max: 40 }), async (old, crashSeed, recoveryCrashAt) => {
        const counting = crashingFileSystem(Number.POSITIVE_INFINITY)
        await commitReplacement(counting.fs, await fixture(old), 'staged', NOW)
        const crashAt = crashSeed % (counting.calls() + 1)

        const layout = await fixture(old)
        const before = await tree(layout.dataDirectory)
        const crashing = crashingFileSystem(crashAt)
        await commitReplacement(crashing.fs, layout, 'staged', NOW).catch(() => undefined)
        // A start may itself stop during recovery; a later start recovers before loading.
        await recoverReplacement(crashingFileSystem(recoveryCrashAt).fs, layout, new Set()).catch(() => undefined)
        await recoverReplacement(nodeReplacementFileSystem, layout, new Set())

        expect(await tree(layout.importDirectory)).toEqual({})
        const folder = join(layout.replacedNotesDirectory, '2026-10-23 14-05-09')
        // Once the journal exists, the replacement can only complete.
        if (!crashing.journalCommitted()) {
          expect(await tree(layout.dataDirectory)).toEqual(before)
          expect(await tree(layout.replacedNotesDirectory)).toEqual({})
          return
        }
        expect(await tree(layout.dataDirectory)).toEqual({
          ...(old.newProfile ? {} : { 'vim-enabled.json': 'true' }),
          'document.json': 'new document',
          'attachments/': '',
          'attachments/new.png': 'new image',
        })
        const moved: Record<string, string> = {}
        for (const [path, contents] of Object.entries(before)) {
          if (path !== 'vim-enabled.json') moved[path] = contents
        }
        if (old.documents.length === 0 && old.images === 0) {
          expect(await tree(layout.replacedNotesDirectory)).toEqual({})
        } else {
          expect(await tree(folder)).toEqual(moved)
        }
      }),
      { numRuns: propertyRuns(40) },
    )
    // Each run prepares two real directory trees.
  }, 120_000)
})
