import type { ElectronApplication } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allowRendererError,
  attachmentFiles,
  clickApplicationMenuQuit,
  closeApp,
  documentPath,
  expect,
  firePaste,
  launchTree,
  node,
  readPersisted,
  seedDocument,
  test,
  typeInto,
  writeClipboardImage,
} from './fixtures'

// Wrap the registered handler so a delayed success still exercises the real
// validation and filesystem path. Injection is confined to the owned test app.
async function holdAttachmentWrite(app: ElectronApplication, rejectFirst = false): Promise<void> {
  await app.evaluate(({}, fail) => {
    const control = globalThis as typeof globalThis & { attachmentStarted?: boolean; releaseAttachment?: () => void }
    const gate = new Promise<void>((resolve) => {
      control.releaseAttachment = resolve
    })
    globalThis.__treeIpc.wrap('tree:write-attachment', async (original, ...args) => {
      control.attachmentStarted = true
      await gate
      if (fail) {
        fail = false
        throw new Error('attachment failed')
      }
      return original(...args)
    })
  }, rejectFirst)
}

test.describe('persistence reliability regressions', () => {
  test('rejects a null primary and preserves recovery documents through quit', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Preserve me', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const backup = readFileSync(documentPath(userDataDir), 'utf8')
    const files = [
      [documentPath(userDataDir), 'null'],
      [`${documentPath(userDataDir)}.tmp`, backup],
      [`${documentPath(userDataDir)}.bak`, backup],
    ] as const
    for (const [path, bytes] of files) writeFileSync(path, bytes)

    const { app, window } = await launchTree(userDataDir, { expectReady: false })

    await expect(window.getByRole('alert')).toContainText('The saved document has an unsupported format.')
    await expect(window.getByRole('textbox')).toHaveCount(0)
    await closeApp(app)
    for (const [path, bytes] of files) expect(readFileSync(path, 'utf8')).toBe(bytes)
  })

  test('keeps invalid recovery files unchanged when the document cannot open', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const files = [
      [documentPath(userDataDir), '{ damaged'],
      [`${documentPath(userDataDir)}.tmp`, '{"version":999}'],
      [`${documentPath(userDataDir)}.bak`, '{ damaged backup'],
    ] as const
    for (const [path, bytes] of files) writeFileSync(path, bytes)

    const { window } = await launchTree(userDataDir, { expectReady: false })

    await expect(window.getByRole('alert')).toContainText('Tree could not open this document')
    for (const [path, bytes] of files) expect(readFileSync(path, 'utf8')).toBe(bytes)
  })

  test('recovers a valid backup after rejecting an unsupported temporary document', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Recovered backup', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const backup = readFileSync(documentPath(userDataDir))
    writeFileSync(`${documentPath(userDataDir)}.bak`, backup)
    writeFileSync(documentPath(userDataDir), '{ damaged')
    writeFileSync(`${documentPath(userDataDir)}.tmp`, '{"version":999}')

    const { window } = await launchTree(userDataDir)

    await expect(node(window, 1)).toHaveValue('Recovered backup')
    expect(readFileSync(documentPath(userDataDir))).toEqual(backup)
    expect(readFileSync(`${documentPath(userDataDir)}.tmp`, 'utf8')).toBe('{"version":999}')
  })

  test('opens a recovery document whose image is missing', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: '', children: [], attachment: { id: 'missing', mimeType: 'image/png' } }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const candidate = readFileSync(documentPath(userDataDir))
    writeFileSync(`${documentPath(userDataDir)}.tmp`, candidate)
    writeFileSync(documentPath(userDataDir), '{ damaged')

    const { window } = await launchTree(userDataDir)

    await expect(window.getByText('Image could not be loaded.')).toBeVisible()
    expect(readFileSync(documentPath(userDataDir))).toEqual(candidate)
  })

  test('keeps a failed save visible and runs deferred cleanup after a successful save', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect(() => expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')).toPass({ timeout: 10_000 })
    allowRendererError(/^Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked$/)
    allowRendererError(/^Operation failed: Error invoking remote method 'tree:write-attachment': Error: image blocked$/)
    allowRendererError(/^Operation failed: Error invoking remote method 'tree:save': Error: save blocked$/)
    allowRendererError(/^Operation failed: The application could not finish saving before quit\.$/)
    await app.evaluate(({ ipcMain }) => {
      const control = globalThis as typeof globalThis & { restoreSave?: () => void; cleanupCount?: number }
      const save = globalThis.__treeIpc.get('tree:save')
      if (save === undefined) throw new Error('Save handler is unavailable.')
      control.restoreSave = () => {
        ipcMain.removeHandler('tree:save')
        ipcMain.handle('tree:save', save)
      }
      const cleanup = globalThis.__treeIpc.get('tree:cleanup-attachments')
      if (cleanup === undefined) throw new Error('Cleanup handler is unavailable.')
      globalThis.__treeIpc.wrap('tree:cleanup-attachments', async (original, ...args) => {
        const result = await original(...args)
        control.cleanupCount = (control.cleanupCount ?? 0) + 1
        return result
      })
      globalThis.__treeIpc.wrap('tree:save', () => {
        throw new Error('save blocked')
      })
      globalThis.__treeIpc.wrap('tree:write-attachment', () => {
        throw new Error('image blocked')
      })
    })
    const initialText = 'unsaved one two three four five six seven eight nine'
    const recoveryText = ' recovered ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen'
    await typeInto(node(window, 1), initialText)
    await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()
    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect(window.getByText(/Operation failed:.*image blocked/)).toBeVisible()
    expect(
      await app.evaluate(() => (globalThis as typeof globalThis & { cleanupCount?: number }).cleanupCount ?? 0),
    ).toBe(0)

    await clickApplicationMenuQuit(app)
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })
    expect(app.process().exitCode).toBeNull()
    await app.evaluate(() => (globalThis as typeof globalThis & { restoreSave?: () => void }).restoreSave?.())
    await typeInto(node(window, 1), recoveryText)
    await expect(window.getByText(/Changes could not be saved:/)).toHaveCount(0)
    await expect
      .poll(() => app.evaluate(() => (globalThis as typeof globalThis & { cleanupCount?: number }).cleanupCount ?? 0))
      .toBeGreaterThan(0)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(`${initialText}${recoveryText}`)
  })

  test('waits for an image paste before menu quit and restores the image on restart', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect(() => expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')).toPass({ timeout: 10_000 })
    await holdAttachmentWrite(app)
    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { attachmentStarted?: boolean }).attachmentStarted),
      )
      .toBe(true)
    await window.evaluate(() => {
      const control = globalThis as typeof globalThis & {
        quitRequested?: boolean
        treeApi: { onQuitRequested(listener: () => void): () => void }
      }
      control.treeApi.onQuitRequested(() => {
        control.quitRequested = true
      })
    })
    await clickApplicationMenuQuit(app)
    await expect
      .poll(() => window.evaluate(() => (globalThis as typeof globalThis & { quitRequested?: boolean }).quitRequested))
      .toBe(true)
    expect(app.process().exitCode).toBeNull()
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await app.evaluate(() =>
      (globalThis as typeof globalThis & { releaseAttachment?: () => void }).releaseAttachment?.(),
    )
    await closed
    const attachment = readPersisted(userDataDir).document.roots[0]?.attachment
    expect(attachment?.id).toEqual(expect.any(String))
    expect(attachmentFiles(userDataDir)).toContain(`${attachment?.id}.png`)

    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.getByAltText('Attached image')).toBeVisible()
  })

  test('cancels quit when the pending image fails and allows a successful paste and quit retry', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    allowRendererError(
      /^Operation failed: Error invoking remote method 'tree:write-attachment': Error: attachment failed$/,
    )
    allowRendererError(/^Operation failed: The application could not finish saving before quit\.$/)
    await holdAttachmentWrite(app, true)
    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { attachmentStarted?: boolean }).attachmentStarted),
      )
      .toBe(true)
    await window.evaluate(() => {
      const control = globalThis as typeof globalThis & {
        quitRequested?: boolean
        treeApi: { onQuitRequested(listener: () => void): () => void }
      }
      control.treeApi.onQuitRequested(() => {
        control.quitRequested = true
      })
    })
    await clickApplicationMenuQuit(app)
    await expect
      .poll(() => window.evaluate(() => (globalThis as typeof globalThis & { quitRequested?: boolean }).quitRequested))
      .toBe(true)
    await app.evaluate(() =>
      (globalThis as typeof globalThis & { releaseAttachment?: () => void }).releaseAttachment?.(),
    )
    await expect(window.getByText(/Operation failed:.*attachment failed/)).toBeVisible()
    await expect(
      window.getByText('Operation failed: The application could not finish saving before quit.'),
    ).toBeVisible({ timeout: 7_000 })
    expect(app.process().exitCode).toBeNull()
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toBeVisible()
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.attachment?.id).toEqual(expect.any(String))
  })

  test('retries the volume save for words inserted after an earlier successful snapshot', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect(() => expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')).toPass({ timeout: 10_000 })
    allowRendererError(/^Changes could not be saved: .*second save failed$/)

    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & {
        saveCalls?: number
        firstSaveStarted?: boolean
        releaseFirstSave?: () => void
      }
      control.saveCalls = 0
      const gate = new Promise<void>((resolve) => {
        control.releaseFirstSave = resolve
      })
      globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
        control.saveCalls = (control.saveCalls ?? 0) + 1
        if (control.saveCalls === 1) {
          control.firstSaveStarted = true
          await gate
          return original(...args)
        }
        if (control.saveCalls === 2) throw new Error('second save failed')
        return original(...args)
      })
    })

    const tenWords = 'one two three four five six seven eight nine ten'
    await typeInto(node(window, 1), `${tenWords} `)
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { firstSaveStarted?: boolean }).firstSaveStarted),
      )
      .toBe(true)

    await typeInto(node(window, 1), `${tenWords} `)
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseFirstSave?: () => void }).releaseFirstSave?.())

    await expect(window.getByText(/Changes could not be saved: .*second save failed/)).toBeVisible()

    await typeInto(node(window, 1), 'eleven ')
    await expect
      .poll(() => app.evaluate(() => (globalThis as typeof globalThis & { saveCalls?: number }).saveCalls ?? 0))
      .toBeGreaterThanOrEqual(3)

    const expectedText = await node(window, 1).inputValue()
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe(expectedText)

    const restarted = await launchTree(userDataDir)
    await expect(node(restarted.window, 1)).toHaveValue(expectedText)
  })

  test('restores a completed image paste after abrupt process termination', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect(() => expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')).toPass({ timeout: 10_000 })
    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]?.attachment?.id ?? null, { timeout: 10_000 })
      .not.toBeNull()
    const attachmentId = readPersisted(userDataDir).document.roots[0]?.attachment?.id
    expect(attachmentId).toEqual(expect.any(String))
    const attachmentPath = join(userDataDir, 'data', 'attachments', `${attachmentId}.png`)
    await expect.poll(() => existsSync(attachmentPath)).toBe(true)
    const stored = readFileSync(attachmentPath)

    const child = app.process()
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill('SIGKILL')
    await exited
    await closeApp(app)

    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.getByAltText('Attached image')).toBeVisible()
    expect(readPersisted(userDataDir).document.roots[0]?.attachment?.id).toBe(attachmentId)
    expect(readFileSync(attachmentPath)).toEqual(stored)
  })
})
