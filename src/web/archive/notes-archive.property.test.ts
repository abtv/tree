import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectAttachmentIds, serializeState } from '../../domain/document'
import { exportNotesArchive } from '../../application/notes-archive/export-notes'
import { deepForest, firstLocation, materialize } from '../../application/test/editor-store-arbitraries'
import { propertyRuns } from '../../test/property-runs'
import { createZipWriter } from './zip-writer'
import { concat, listCentralEntries, readArchive } from './zip-test-utils'

describe('notes archive export properties', () => {
  it('contains exactly the saved head and each available referenced image, in id order', async () => {
    await fc.assert(
      fc.asyncProperty(
        deepForest,
        fc.func(fc.oneof(fc.constant(undefined), fc.uint8Array({ minLength: 1, maxLength: 64 }))),
        fc.array(fc.uint8Array({ minLength: 1, maxLength: 16 }), { maxLength: 3 }),
        async (forest, imageFor, unreferenced) => {
          const document = materialize(forest)
          const head = serializeState(document, firstLocation(document), { expandedIds: [] })
          const referenced = [...collectAttachmentIds(document)].sort()
          const stored = new Map<string, Uint8Array | undefined>(referenced.map((id) => [id, imageFor(id)]))
          unreferenced.forEach((bytes, index) => stored.set(`unreferenced-${index}`, bytes))

          const chunks: Uint8Array[] = []
          const summary = await exportNotesArchive(
            { readHead: async () => head, readImage: async (id) => stored.get(id)?.slice() },
            createZipWriter((chunk) => chunks.push(chunk.slice())),
          )
          const archive = concat(chunks)
          const available = referenced.filter((id) => stored.get(id) !== undefined)

          expect(listCentralEntries(archive).map((entry) => entry.name)).toEqual([
            'document.json',
            ...available.map((id) => `attachments/${id}.png`),
          ])
          const entries = readArchive(archive)
          expect(JSON.parse(new TextDecoder().decode(entries.get('document.json')))).toEqual(head)
          for (const id of available) expect(entries.get(`attachments/${id}.png`)).toEqual(stored.get(id))
          expect(summary).toEqual({
            imageCount: available.length,
            missingImageCount: referenced.length - available.length,
            archiveBytes: archive.byteLength,
          })
        },
      ),
      { numRuns: propertyRuns(100) },
    )
  })
})
