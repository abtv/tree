// @editing-modes: independent
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onePixelPng } from '../../src/electron/main/png-test-utils'
import {
  closeApp,
  configureHiddenParallelTests,
  documentPath,
  expect,
  launchTree,
  node,
  seedDocument,
  test,
} from './fixtures'

// A replacement interrupted at each step of its journal (ADR 0024) must open the imported notes on
// the next start and keep every previous file in the Replaced Notes folder.

const FOLDER = '2026-10-23 14-05-09'
const OLD_DOCUMENT_FILES = ['document.json', 'document.3.json', 'document.json.bak'] as const

function seedOldNotes(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'root', text: 'Previous notes', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'root' },
  })
  const data = join(userDataDir, 'data')
  const previous = readFileSync(documentPath(userDataDir))
  writeFileSync(join(data, 'document.3.json'), previous)
  writeFileSync(join(data, 'document.json.bak'), previous)
  mkdirSync(join(data, 'attachments'), { recursive: true })
  writeFileSync(join(data, 'attachments', 'old.png'), 'old image')
}

function stageImport(userDataDir: string, document: string): string {
  const staging = join(userDataDir, '.notes-import', 'staged')
  mkdirSync(join(staging, 'attachments'), { recursive: true })
  writeFileSync(join(staging, 'document.json'), document)
  writeFileSync(join(staging, 'attachments', 'new.png'), onePixelPng)
  writeFileSync(
    join(userDataDir, '.notes-import', 'commit.json'),
    JSON.stringify({ staging: 'staged', replaced: FOLDER }),
  )
  return staging
}

const importedDocument = JSON.stringify({
  version: 1,
  document: {
    roots: [
      {
        id: 'imported',
        text: 'Imported notes',
        attachment: { id: 'new', mimeType: 'image/png' },
        children: [],
      },
    ],
  },
  location: { currentParentId: null, selectedNodeId: 'imported' },
})

/** Applies the first steps of the commit, as a crash after them would leave the files. */
const STAGES: ReadonlyArray<{ name: string; apply: (userDataDir: string, staging: string) => void }> = [
  { name: 'after the journal', apply: () => {} },
  {
    name: 'after the primary document moved',
    apply: (userDataDir) => {
      const folder = join(userDataDir, 'Replaced Notes', FOLDER)
      mkdirSync(folder, { recursive: true })
      renameSync(documentPath(userDataDir), join(folder, 'document.json'))
    },
  },
  {
    name: 'after every previous file moved',
    apply: (userDataDir) => {
      const folder = join(userDataDir, 'Replaced Notes', FOLDER)
      mkdirSync(folder, { recursive: true })
      for (const name of OLD_DOCUMENT_FILES) renameSync(join(userDataDir, 'data', name), join(folder, name))
      renameSync(join(userDataDir, 'data', 'attachments'), join(folder, 'attachments'))
    },
  },
  {
    name: 'after the imported images moved in',
    apply: (userDataDir, staging) => {
      const folder = join(userDataDir, 'Replaced Notes', FOLDER)
      mkdirSync(folder, { recursive: true })
      for (const name of OLD_DOCUMENT_FILES) renameSync(join(userDataDir, 'data', name), join(folder, name))
      renameSync(join(userDataDir, 'data', 'attachments'), join(folder, 'attachments'))
      renameSync(join(staging, 'attachments'), join(userDataDir, 'data', 'attachments'))
    },
  },
]

// @requirement PRODUCT.md §25.4
test.describe('interrupted notes replacement', () => {
  configureHiddenParallelTests()

  for (const stage of STAGES) {
    test(`completes a replacement interrupted ${stage.name}`, async ({ userDataDir }) => {
      seedOldNotes(userDataDir)
      const previous = readFileSync(documentPath(userDataDir), 'utf8')
      stage.apply(userDataDir, stageImport(userDataDir, importedDocument))

      const { app, window } = await launchTree(userDataDir)

      await expect(node(window, 1)).toHaveValue('Imported notes')
      await closeApp(app)
      const folder = join(userDataDir, 'Replaced Notes', FOLDER)
      expect(readdirSync(folder).sort()).toEqual(['attachments', ...OLD_DOCUMENT_FILES].sort())
      expect(readFileSync(join(folder, 'document.json'), 'utf8')).toBe(previous)
      expect(readdirSync(join(folder, 'attachments'))).toEqual(['old.png'])
      const data = readdirSync(join(userDataDir, 'data'))
      expect(data.filter((name) => /^document\.(\d+\.json|json\.bak)$/.test(name))).toEqual([])
      expect(readdirSync(join(userDataDir, 'data', 'attachments'))).toEqual(['new.png'])
      expect(readdirSync(join(userDataDir, '.notes-import'))).toEqual([])
    })
  }

  test('never opens the previous notes when the imported document is damaged', async ({ userDataDir }) => {
    seedOldNotes(userDataDir)
    stageImport(userDataDir, '{"version":1,"document":')

    const { app, window } = await launchTree(userDataDir, { expectReady: false })

    await expect(window.getByRole('alert')).toContainText('Tree could not open this document')
    await expect(window.getByRole('textbox')).toHaveCount(0)
    await closeApp(app)
    const folder = join(userDataDir, 'Replaced Notes', FOLDER)
    expect(readdirSync(folder).sort()).toEqual(['attachments', ...OLD_DOCUMENT_FILES].sort())
    expect(existsSync(join(userDataDir, '.notes-import', 'commit.json'))).toBe(false)
  })
})
