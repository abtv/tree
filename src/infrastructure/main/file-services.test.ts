import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileServices } from './file-services'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function servicesForTest() {
  const directory = await mkdtemp(join(tmpdir(), 'tree-file-services-'))
  temporaryDirectories.push(directory)
  return { directory, services: createFileServices(directory) }
}

describe('file services', () => {
  it('saves and loads a versioned state without absolute attachment paths', async () => {
    const { directory, services } = await servicesForTest()
    const state = {
      version: 1 as const,
      document: { roots: [{ id: 'root', text: '', attachment: { id: 'image', mimeType: 'image/png' as const }, children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }

    await services.save(state)

    expect(await services.load()).toEqual(state)
    expect(await readFile(join(directory, 'document.json'), 'utf8')).not.toContain(directory)
  })

  it('keeps referenced attachments and removes unreferenced files', async () => {
    const { services } = await servicesForTest()
    await services.writeAttachment('keep', new Uint8Array([1]))
    await services.writeAttachment('remove', new Uint8Array([2]))

    await services.cleanupAttachments(['keep'])

    expect(await services.readAttachment('keep')).toEqual(new Uint8Array([1]))
    expect(await services.readAttachment('remove')).toBeNull()
  })
})
