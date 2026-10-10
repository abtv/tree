// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allowRendererError,
  attachmentFiles,
  attachmentPath,
  closeApp,
  exactMessage,
  expect,
  lockSystemClipboard,
  launchTree as launchTreeBase,
  node,
  pressShifted,
  readPersisted,
  seedDocument,
  setCursor,
  startRowDrag,
  test,
} from './fixtures'

const launchTree = (userDataDir: string) => launchTreeBase(userDataDir, { initialMode: 'normal' })

const attachmentImageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
  'base64',
)

function seedAttachmentImage(userDataDir: string, attachmentId: string): void {
  const directory = join(userDataDir, 'data', 'attachments')
  mkdirSync(directory, { recursive: true })
  writeFileSync(attachmentPath(userDataDir, attachmentId), attachmentImageBytes)
}

test.describe('Vim editing: image caret', () => {
  // @requirement PRODUCT.md §20.2.23
  for (const boundary of ['first', 'last'] as const) {
    test(`preserves text and image return carets when Visual Node motion clamps at the ${boundary} sibling`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'first', text: 'First text', attachment: { id: 'first-image', mimeType: 'image/png' }, children: [] },
            { id: 'peer', text: 'Middle text', children: [] },
            { id: 'last', text: 'Last text', attachment: { id: 'last-image', mimeType: 'image/png' }, children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: boundary },
      })
      seedAttachmentImage(userDataDir, 'first-image')
      seedAttachmentImage(userDataDir, 'last-image')
      const { window } = await launchTree(userDataDir)
      const editor = node(window, boundary === 'first' ? 1 : 3)
      await editor.focus()
      const motions = boundary === 'first' ? [['k'], ['9', '9', 'k'], ['g', 'g']] : [['j'], ['9', '9', 'j'], ['G']]
      for (const imageActive of [false, true]) {
        await setCursor(editor, 2)
        if (imageActive) {
          await editor.press('j')
          await expect(editor).toHaveClass(/node-input-image-caret/)
        }
        await window.keyboard.press('V')
        const cursor = imageActive ? (boundary === 'first' ? 'First text' : 'Last text').length : 2
        for (const keys of [...motions, ...motions]) {
          for (const key of keys) await window.keyboard.press(key)
          await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
          await expect(editor).toBeFocused()
          await expect(editor).toHaveJSProperty('selectionStart', cursor)
          await expect(window.locator('.node-row-visual-selected')).toHaveCount(1)
          await expect(editor).not.toHaveClass(/node-input-image-caret/)
        }
        if (imageActive && boundary === 'first')
          await expect(window.locator('.node-list')).toHaveScreenshot('vim-clamped-visual-node-range.png')
        await window.keyboard.press('Escape')
        if (imageActive) {
          await expect(editor).toHaveClass(/node-input-image-caret/)
          if (boundary === 'first')
            await expect(window.locator('.node-list')).toHaveScreenshot('vim-clamped-visual-node-image.png')
          await editor.press('k')
          await expect(editor).toHaveJSProperty('selectionStart', 2)
          await expect(editor).not.toHaveClass(/node-input-image-caret/)
        }
      }
    })
  }

  test('preserves forward and reverse Visual Node ranges at their boundaries', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First text', children: [] },
          { id: 'middle', text: 'Middle text', children: [] },
          { id: 'last', text: 'Last text', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'middle' },
    })
    const { window } = await launchTree(userDataDir)
    for (const boundary of ['first', 'last'] as const) {
      await node(window, 2).focus()
      await window.keyboard.press('V')
      await window.keyboard.press(boundary === 'first' ? 'k' : 'j')
      const editor = node(window, boundary === 'first' ? 1 : 3)
      await setCursor(editor, 2)
      const selected = window.locator('.node-row-visual-selected')
      const ids = await selected.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.nodeId))
      const motions =
        boundary === 'first'
          ? [
              ['9', 'k'],
              ['g', 'g'],
            ]
          : [['9', 'j'], ['G']]
      for (const keys of motions) {
        for (const key of keys) await window.keyboard.press(key)
        await expect(editor).toBeFocused()
        await expect(editor).toHaveJSProperty('selectionStart', 2)
        expect(await selected.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.nodeId))).toEqual(
          ids,
        )
      }
      await expect(selected).toHaveCount(2)
      await window.keyboard.press('Escape')
    }
  })

  test('preserves the sole image through every clamped Visual Node motion', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'picture', text: '', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'picture' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await window.keyboard.press('V')
    for (const keys of [['j'], ['k'], ['9', 'j'], ['9', 'k'], ['g', 'g'], ['G']]) {
      for (const key of keys) await window.keyboard.press(key)
      await expect(editor).toBeFocused()
      await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
      await expect(editor).toHaveJSProperty('selectionStart', 0)
      await expect(window.locator('.node-row-visual-selected')).toHaveCount(1)
    }
    await window.keyboard.press('Escape')
    await editor.press('k')
    await expect(editor).toHaveClass(/node-input-image-caret/)
  })

  test('uses the image only for textless boundary and viewport destinations', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'picture', text: '', children: [], attachment: { id: 'image', mimeType: 'image/png' } }],
      },
      location: { currentParentId: 'picture', selectedNodeId: 'picture' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const input = window.locator('.node-input')
    for (const keys of [['g', 'g'], ['G'], ['H'], ['M'], ['L'], ['Control+d'], ['Control+u']]) {
      for (const key of keys) await window.keyboard.press(key)
      await expect(input).toBeFocused()
      await expect(input).toHaveClass(/node-input-image-caret/)
      await expect(input).toHaveJSProperty('selectionStart', 0)
    }
  })

  test('replays gp onto an image and a Visual shift without losing the image caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [] },
          { id: 'b', text: 'B', children: [] },
          { id: 'picture', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('0')
    await pressShifted(window, 'Y')
    const picture = node(window, 3)
    await picture.focus()
    await window.keyboard.press('$')
    await window.keyboard.press('g')
    await window.keyboard.press('p')
    await expect(picture).toHaveValue('abA')
    await expect(picture).toHaveClass(/node-input-image-caret/)
    await window.keyboard.press('u')
    await window.keyboard.press('$')
    await window.keyboard.press('.')
    await expect(picture).toHaveValue('abA')
    await expect(picture).toHaveClass(/node-input-image-caret/)
    await window.keyboard.press('k')
    await expect(picture).not.toHaveClass(/node-input-image-caret/)
    await setCursor(picture, 0)
    await window.keyboard.press('v')
    await pressShifted(window, '>')
    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await picture.focus()
    await window.keyboard.press('$')
    await window.keyboard.press('l')
    await window.keyboard.press('.')
    await expect(window.locator('.node-row[data-node-id="picture"]')).toHaveAttribute('data-depth', '1')
    await expect(picture).toBeFocused()
    await expect(picture).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-repeat-image-shift-light.png')
    await window.keyboard.press('k')
    await expect(picture).not.toHaveClass(/node-input-image-caret/)
  })

  test('opens an image immediately after moving up from another image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'text-image', text: 'Texted', attachment: { id: 'first-image', mimeType: 'image/png' }, children: [] },
          { id: 'image-only', text: '', attachment: { id: 'second-image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'image-only' },
    })
    seedAttachmentImage(userDataDir, 'first-image')
    seedAttachmentImage(userDataDir, 'second-image')
    const { window } = await launchTree(userDataDir)
    await expect(node(window, 2)).toHaveClass(/node-input-image-caret/)
    await node(window, 2).press('k')
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveClass(/node-input-image-caret/)
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 6)
    await window.locator('.node-list').screenshot({ path: test.info().outputPath('upward-image-caret.png') })
    await node(window, 1).press('Enter')
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(node(window, 1)).toBeFocused()
    await node(window, 1).press('Enter')
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await window.keyboard.press('Escape')
    await node(window, 1).press('k')
    await expect(node(window, 1)).not.toHaveClass(/node-input-image-caret/)
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 0)
    await node(window, 1).press('j')
    await node(window, 1).press('Enter')
    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
  })

  test('keeps image-character steps within an expanded row before visible-row motion', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'branch',
            text: 'Branch',
            attachment: { id: 'branch-image', mimeType: 'image/png' },
            children: [{ id: 'child', text: 'Child', children: [] }],
          },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'branch' },
    })
    seedAttachmentImage(userDataDir, 'branch-image')
    const { window } = await launchTree(userDataDir)
    const branch = node(window, 1)
    await window.getByRole('button', { name: 'Expand node 1' }).click()
    await branch.focus()
    await setCursor(branch, 1)

    await branch.press('j')
    await expect(branch).toHaveClass(/node-input-image-caret/)
    await branch.press('j')
    await expect(node(window, 2)).toBeFocused()
    await node(window, 2).press('k')
    await expect(branch).toBeFocused()
    await expect(branch).toHaveClass(/node-input-image-caret/)
    await branch.press('k')
    await expect(branch).not.toHaveClass(/node-input-image-caret/)
    await expect(branch).toHaveJSProperty('selectionStart', 0)

    await setCursor(branch, 1)
    await branch.press('2')
    await branch.press('j')
    await expect(node(window, 2)).toBeFocused()
  })

  test('navigates between text and its image before moving between nodes', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'with-image', text: 'Texted', attachment: { id: 'attachment', mimeType: 'image/png' }, children: [] },
          { id: 'next', text: 'Next', children: [] },
          {
            id: 'image-only',
            text: '',
            attachment: { id: 'image-only-attachment', mimeType: 'image/png' },
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'with-image' },
    })
    seedAttachmentImage(userDataDir, 'attachment')
    seedAttachmentImage(userDataDir, 'image-only-attachment')
    const { window } = await launchTree(userDataDir)
    const withImage = node(window, 1)
    await withImage.focus()
    await setCursor(withImage, 1)

    await withImage.press('j')
    await expect(withImage).toHaveJSProperty('selectionStart', 6)
    await withImage.press('h')
    await expect(withImage).toHaveJSProperty('selectionStart', 1)
    await withImage.press('j')
    await expect(withImage).toHaveJSProperty('selectionStart', 6)
    await withImage.press('k')
    await expect(withImage).toHaveJSProperty('selectionStart', 1)

    await setCursor(withImage, 3)
    await withImage.press('l')
    await withImage.press('l')
    await withImage.press('l')
    await expect(withImage).toHaveJSProperty('selectionStart', 6)
    await withImage.press('h')
    await expect(withImage).toHaveJSProperty('selectionStart', 5)

    await withImage.press('j')
    await expect(withImage).toHaveJSProperty('selectionStart', 6)
    await withImage.press('j')
    await expect(node(window, 2)).toBeFocused()

    await node(window, 3).focus()
    await node(window, 3).press('k')
    await expect(node(window, 2)).toBeFocused()
  })

  test('clears the image caret when a text motion leaves an attached image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'with-image', text: 'Abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'with-image' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)

    await editor.press('j')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-image-before-text-motion.png')
    await editor.press('0')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-text-motion-from-image.png')
    await editor.press('h')
    await expect(editor).toHaveJSProperty('selectionStart', 0)

    await editor.press('j')
    await editor.press('$')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await editor.press('h')
    await expect(editor).toHaveJSProperty('selectionStart', 2)

    await editor.press('j')
    await editor.press('v')
    await editor.press('0')
    await editor.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)

    await editor.press('j')
    await editor.press('v')
    await editor.press('0')
    await editor.press('v')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)

    for (const exitKey of ['Escape', 'v']) {
      for (const [keys, endpoint] of [
        ['0ll', 2],
        ['0o0llo', 0],
        ['$h', 2],
      ] as const) {
        await editor.press('j')
        await editor.press('v')
        await window.keyboard.type(keys)
        await editor.press(exitKey)
        await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
        await expect(editor).not.toHaveClass(/node-input-image-caret/)
        await expect(editor).toHaveJSProperty('selectionStart', endpoint)
        await expect(editor).toHaveJSProperty('selectionEnd', endpoint + 1)
      }
    }
    await window.screenshot({ path: 'test-results/vc2-image-normal.png' })
  })

  test('keeps the attached image caret and indicator through a cancelled drag', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'image-only', text: '', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'image-only' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await expect(editor).toHaveClass(/node-input-image-caret/)

    await startRowDrag(window, editor)
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    const frozen = await editor.evaluate((element) => {
      const input = element as HTMLTextAreaElement
      return [input.selectionStart, input.selectionEnd]
    })
    expect(await editor.evaluate((element) => document.activeElement === element)).toBe(false)

    await window.keyboard.press('Escape')
    await window.mouse.up()

    await expect(editor).toBeFocused()
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    expect(
      await editor.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      }),
    ).toEqual(frozen)
  })

  for (const text of ['', 'abcd']) {
    test(`keeps the ${text === '' ? 'image' : 'non-final text'} caret when an attached node is dropped onto a row`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'source', text, attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
            { id: 'parent', text: 'Parent', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'source' },
      })
      seedAttachmentImage(userDataDir, 'image')
      const { window } = await launchTree(userDataDir)
      const editor = window.locator('.node-row[data-node-id="source"] .node-input')
      await editor.focus()
      await startRowDrag(window, editor)
      const cursor = await editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)
      const target = window.locator('.node-row[data-node-id="parent"]')
      const box = await target.boundingBox()
      if (box === null) throw new Error('The receiving parent was not rendered.')
      await window.mouse.move(box.x + 30, box.y + box.height / 2)
      await expect(target).toHaveClass(/node-row-drop-on/)
      await window.mouse.up()
      await expect(editor).toBeFocused()
      await expect(window.locator('.node-row[data-node-id="source"]')).toHaveAttribute('data-depth', '1')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      expect(await editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(cursor)
      if (text === '') await expect(editor).toHaveClass(/node-input-image-caret/)
      else {
        expect(cursor).toBeLessThan(text.length - 1)
        await expect(editor).not.toHaveClass(/node-input-image-caret/)
      }
      await expect(window.getByAltText('Attached image')).toBeVisible()
    })
  }

  test('treats an image-only node as one character and crosses its row in both directions', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'previous', text: 'Previous', children: [] },
          {
            id: 'image-only',
            text: '',
            attachment: { id: 'image-only-attachment', mimeType: 'image/png' },
            children: [],
          },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'image-only' },
    })
    seedAttachmentImage(userDataDir, 'image-only-attachment')
    const { window } = await launchTree(userDataDir)
    const imageOnly = node(window, 2)
    await imageOnly.focus()
    await expect(imageOnly).toHaveClass(/node-input-image-caret/)

    for (const key of ['h', 'l', '0', '$']) {
      await imageOnly.press(key)
      await expect(imageOnly).toBeFocused()
      await expect(imageOnly).toHaveClass(/node-input-image-caret/)
      await expect(imageOnly).toHaveJSProperty('selectionStart', 0)
    }

    await imageOnly.press('j')
    await expect(node(window, 3)).toBeFocused()
    await expect(node(window, 3)).toHaveJSProperty('selectionStart', 0)

    await imageOnly.focus()
    await imageOnly.press('k')
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).not.toHaveClass(/node-input-image-caret/)
  })

  test('keeps the image-only caret when k is clamped at the first root', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'first-image-only',
            text: '',
            attachment: { id: 'first-image', mimeType: 'image/png' },
            children: [],
          },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first-image-only' },
    })
    seedAttachmentImage(userDataDir, 'first-image')
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    await first.focus()
    await expect(first).toHaveClass(/node-input-image-caret/)

    await first.press('k')

    await expect(first).toBeFocused()
    await expect(first).toHaveClass(/node-input-image-caret/)
    await expect(first).toHaveJSProperty('selectionStart', 0)
    await expect(window.locator('.node-row[data-node-id="first-image-only"]')).toHaveScreenshot(
      'vim-image-only-first-root-boundary-light.png',
    )
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-row[data-node-id="first-image-only"]')).toHaveScreenshot(
      'vim-image-only-first-root-boundary-dark.png',
    )
  })

  test('keeps the image-only caret after an empty Insert session ends with Escape', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'image-only',
            text: '',
            attachment: { id: 'image-only-attachment', mimeType: 'image/png' },
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'image-only' },
    })
    seedAttachmentImage(userDataDir, 'image-only-attachment')
    const { window } = await launchTree(userDataDir)
    const imageOnly = node(window, 1)
    await imageOnly.focus()
    await expect(imageOnly).toHaveClass(/node-input-image-caret/)

    await imageOnly.press('i')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.press('Escape')

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(imageOnly).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="image-only"]')).toHaveScreenshot(
      'vim-insert-escape-image-only-light.png',
    )
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-row[data-node-id="image-only"]')).toHaveScreenshot(
      'vim-insert-escape-image-only-dark.png',
    )
  })

  test('counts the image row when moving from text to the next sibling', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'with-image', text: 'Abcd', attachment: { id: 'attachment', mimeType: 'image/png' }, children: [] },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'with-image' },
    })
    seedAttachmentImage(userDataDir, 'attachment')
    const { window } = await launchTree(userDataDir)
    const withImage = node(window, 1)
    await withImage.focus()
    await setCursor(withImage, 1)
    await withImage.press('2')
    await withImage.press('j')
    await expect(node(window, 2)).toBeFocused()
    await expect(node(window, 2)).toHaveJSProperty('selectionStart', 3)

    await node(window, 2).press('k')
    await expect(withImage).toHaveClass(/node-input-image-caret/)
    await withImage.press('k')
    await expect(withImage).not.toHaveClass(/node-input-image-caret/)
    await expect(withImage).toHaveJSProperty('selectionStart', 3)
  })

  test('leaves an image through a pointer focus change without leaving Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'with-image', text: 'Abcd', attachment: { id: 'attachment', mimeType: 'image/png' }, children: [] },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'with-image' },
    })
    seedAttachmentImage(userDataDir, 'attachment')
    const { window } = await launchTree(userDataDir)
    const withImage = node(window, 1)
    await withImage.focus()
    await setCursor(withImage, 1)
    await withImage.press('j')
    await expect(withImage).toHaveClass(/node-input-image-caret/)

    const next = node(window, 2)
    await next.click()
    await expect(next).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(withImage).not.toHaveClass(/node-input-image-caret/)
    await next.press('x')
    await expect.poll(async () => (await next.inputValue()).length).toBe(3)
  })

  test('moves G to text before the last node image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'last', text: 'Last', attachment: { id: 'last-image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    seedAttachmentImage(userDataDir, 'last-image')
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('G')

    await expect(node(window, 2)).toBeFocused()
    await expect(node(window, 2)).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 2)).toHaveJSProperty('selectionEnd', 1)
    await expect(node(window, 2)).not.toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="last"] .attachment-image-caret')).toHaveCount(0)
  })

  test('moves from a root image to the next node text caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root-image',
            text: 'Root',
            attachment: { id: 'root-image-attachment', mimeType: 'image/png' },
            children: [],
          },
          { id: 'next', text: 'Next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root-image' },
    })
    seedAttachmentImage(userDataDir, 'root-image-attachment')
    const { window } = await launchTree(userDataDir)
    const root = node(window, 1)
    await root.focus()
    await setCursor(root, 3)
    await root.press('l')
    await expect(root).toHaveClass(/node-input-image-caret/)

    await root.press('j')

    const next = node(window, 2)
    await expect(next).toBeFocused()
    await expect(next).toHaveJSProperty('selectionStart', 0)
    await expect(next).toHaveJSProperty('selectionEnd', 1)
  })

  test('moves focus across an image-bearing sibling with counted k', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'middle', text: 'Middle', attachment: { id: 'middle-image', mimeType: 'image/png' }, children: [] },
          { id: 'last', text: 'Last', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'last' },
    })
    seedAttachmentImage(userDataDir, 'middle-image')
    const { window } = await launchTree(userDataDir)
    const last = node(window, 3)
    await last.focus()
    await setCursor(last, 2)
    await last.press('2')
    await last.press('k')

    const first = node(window, 1)
    await expect(first).toBeFocused()
    await expect(first).toHaveJSProperty('selectionStart', 2)
    await expect(first).not.toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="first"]')).toHaveScreenshot(
      'vim-counted-k-past-image-light.png',
    )
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-row[data-node-id="first"]')).toHaveScreenshot(
      'vim-counted-k-past-image-dark.png',
    )
  })

  test('keeps the image caret at the last-node boundary and applies counted h on exit', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'last', text: 'Last', attachment: { id: 'last-image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'last' },
    })
    seedAttachmentImage(userDataDir, 'last-image')
    const { window } = await launchTree(userDataDir)
    const last = node(window, 1)
    await last.focus()
    await setCursor(last, 1)
    await last.press('j')
    await last.press('j')
    await expect(last).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="last"] .attachment-image-caret')).toHaveCount(1)
    await expect(window.locator('.node-row[data-node-id="last"]')).toHaveScreenshot('vim-last-image-boundary-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-row[data-node-id="last"]')).toHaveScreenshot('vim-last-image-boundary-dark.png')

    await last.press('2')
    await last.press('h')
    await expect(last).toHaveJSProperty('selectionStart', 0)
    await expect(last).toHaveJSProperty('selectionEnd', 1)
  })

  test('returns to text after an oversized counted l enters the image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'Abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)

    await editor.press('9')
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 4)
    await expect(window.locator('.node-row[data-node-id="root"]')).toHaveScreenshot('vim-counted-l-image-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-row[data-node-id="root"]')).toHaveScreenshot('vim-counted-l-image-dark.png')
    await editor.press('h')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await expect(editor).toHaveJSProperty('selectionEnd', 4)
    await expect(window.locator('.node-row[data-node-id="root"]')).toHaveScreenshot(
      'vim-counted-l-return-text-dark.png',
    )
    await window.emulateMedia({ colorScheme: 'light' })
    await expect(window.locator('.node-row[data-node-id="root"]')).toHaveScreenshot(
      'vim-counted-l-return-text-light.png',
    )
  })

  test('moves onto the image after deleting the final text character', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          { id: 'peer', text: 'a', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)

    await editor.press('x')

    await expect(editor).toHaveValue('a')
    await expect(editor).toHaveJSProperty('selectionStart', 1)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="root"] .attachment-image-caret')).toHaveCount(1)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-edited-image-caret-focused-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-edited-image-caret-focused-dark.png')

    await editor.press('G')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(node(window, 2)).not.toHaveClass(/node-input-image-caret/)
    await node(window, 2).press('j')
    await expect(node(window, 2)).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-edited-image-caret-peer-dark.png')
    await window.emulateMedia({ colorScheme: 'light' })
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-edited-image-caret-peer-light.png')
  })

  test('advances onto the image after toggling the final text character', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)

    await editor.press('~')

    await expect(editor).toHaveValue('aB')
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveClass(/node-input-image-caret/)
  })

  test('moves a Visual deletion onto the remaining image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('v')
    await editor.press('d')

    await expect(editor).toHaveValue('a')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveJSProperty('selectionStart', 1)
    await expect(editor).toHaveClass(/node-input-image-caret/)
  })

  test('returns to a text caret after putting plain text from an image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await editor.press('v')
    await lockSystemClipboard()
    await editor.press('y')
    await editor.press('2')
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)

    await editor.press('P')

    await expect(editor).toHaveValue('aba')
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="root"] .attachment-image-caret')).toHaveCount(0)
    await expect(window.locator('.node-row[data-node-id="root"]')).toHaveScreenshot('vim-put-from-image-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-row[data-node-id="root"]')).toHaveScreenshot('vim-put-from-image-dark.png')

    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('p')
    await expect(editor).toHaveValue('abaa')
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
  })

  test('synchronizes text caret destinations after gg and viewport motions', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'A', attachment: { id: 'first-image', mimeType: 'image/png' }, children: [] },
          { id: 'last', text: 'Longer', attachment: { id: 'last-image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    seedAttachmentImage(userDataDir, 'first-image')
    seedAttachmentImage(userDataDir, 'last-image')
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const last = node(window, 2)
    await first.focus()
    await first.press('G')
    await last.press('g')
    await last.press('g')
    await expect(first).toBeFocused()
    await expect(first).not.toHaveClass(/node-input-image-caret/)
    await expect(first).toHaveJSProperty('selectionStart', 0)
    await expect(window.locator('.node-row[data-node-id="first"] .attachment-image-caret')).toHaveCount(0)

    await first.press('G')
    await last.press('H')
    await expect(first).toBeFocused()
    await expect(first).not.toHaveClass(/node-input-image-caret/)
    await expect(first).toHaveJSProperty('selectionStart', 0)
    await first.press('Control+d')
    await expect(last).toBeFocused()
    await expect(last).toHaveJSProperty('selectionStart', 0)
    await expect(last).not.toHaveClass(/node-input-image-caret/)
    await last.press('Control+u')
    await expect(first).toBeFocused()
    await expect(first).toHaveJSProperty('selectionStart', 0)
    await window.screenshot({ path: 'test-results/nr1-text-before-image.png' })
  })

  test('does not restore a different image’s saved text position after G', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'ABCD', attachment: { id: 'first-image', mimeType: 'image/png' }, children: [] },
          { id: 'last', text: 'Longer', attachment: { id: 'last-image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    seedAttachmentImage(userDataDir, 'first-image')
    seedAttachmentImage(userDataDir, 'last-image')
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const last = node(window, 2)
    await first.focus()
    await setCursor(first, 1)
    await first.press('j')
    await first.press('G')
    await expect(last).not.toHaveClass(/node-input-image-caret/)
    await expect(last).toHaveJSProperty('selectionStart', 0)
    await last.press('j')
    await expect(last).toHaveClass(/node-input-image-caret/)
    await last.press('h')
    await expect(last).toHaveJSProperty('selectionStart', 0)
    await expect(last).toHaveJSProperty('selectionEnd', 1)
  })

  test('moves k onto an attached current-parent image from its first child', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            attachment: { id: 'parent-image', mimeType: 'image/png' },
            children: [{ id: 'child', text: 'Child', children: [] }],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    seedAttachmentImage(userDataDir, 'parent-image')
    const { window } = await launchTree(userDataDir)

    await node(window, 1).focus()
    await window.keyboard.press('k')

    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toBeFocused()
    await expect(parent).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.current-parent .attachment-image-caret')).toHaveCount(1)
    await expect(window.locator('.current-parent')).toHaveScreenshot('vim-current-parent-image-caret-light.png')

    await parent.press('k')

    await expect(parent).not.toHaveClass(/node-input-image-caret/)
    await expect(parent).toHaveJSProperty('selectionStart', 0)
    await expect(parent).toHaveJSProperty('selectionEnd', 1)

    await parent.press('k')

    await expect(parent).not.toHaveClass(/node-input-image-caret/)
    await expect(parent).toHaveJSProperty('selectionStart', 0)
    await expect(parent).toHaveJSProperty('selectionEnd', 1)
  })

  test('clears a stale image caret after leaving an attached current parent with Ctrl+o', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            attachment: { id: 'parent-image', mimeType: 'image/png' },
            children: [{ id: 'child', text: 'Child', children: [] }],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    seedAttachmentImage(userDataDir, 'parent-image')
    const { window } = await launchTree(userDataDir)

    await node(window, 1).focus()
    await window.keyboard.press('k')
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveClass(/node-input-image-caret/)

    await parent.press('Control+o')

    const root = node(window, 1)
    await expect(root).toHaveValue('Parent')
    await expect(root).toBeFocused()
    await expect(root).not.toHaveClass(/node-input-image-caret/)
  })

  test('clears a stale image caret when zM closes the folds hiding it', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            attachment: { id: 'parent-image', mimeType: 'image/png' },
            children: [
              {
                id: 'child',
                text: 'Child',
                attachment: { id: 'child-image', mimeType: 'image/png' },
                children: [],
              },
            ],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    seedAttachmentImage(userDataDir, 'parent-image')
    seedAttachmentImage(userDataDir, 'child-image')
    const { window } = await launchTree(userDataDir)

    // Expand the parent and move the child's caret onto its own image, then close every fold with
    // zM: the hidden image caret must not stay active when the displayed ancestor is selected.
    await node(window, 1).focus()
    await window.keyboard.press('z')
    await window.keyboard.press('a')
    const child = node(window, 2)
    await child.focus()
    await setCursor(child, 'Child'.length - 1)
    await child.press('l')
    await expect(child).toHaveClass(/node-input-image-caret/)

    await child.press('z')
    await pressShifted(window, 'M')

    const destination = node(window, 1)
    await expect(destination).toBeFocused()
    await expect(destination).toHaveValue('Parent')
    await expect(destination).not.toHaveClass(/node-input-image-caret/)
    await expect(destination).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 2)).toHaveCount(0)
    await expect(window.locator('.attachment-image-caret')).toHaveCount(0)
  })

  test('moves the image caret to the change that undo and redo apply', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)

    await editor.press('x')
    await expect(editor).toHaveValue('a')
    await expect(editor).toHaveClass(/node-input-image-caret/)

    // Undo restores the deleted character and puts the caret on it, clearing the stale image caret.
    await editor.press('u')
    await expect(editor).toHaveValue('ab')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 1)
    await expect(editor).toHaveJSProperty('selectionEnd', 2)

    // Redoing the deletion leaves the same state the original `x` did: the change is at offset 1,
    // which is the image once the final text character is gone.
    await editor.press('Control+r')
    await expect(editor).toHaveValue('a')
    await expect(editor).toHaveClass(/node-input-image-caret/)
  })

  test('retains the image return position when focus-changing commands do nothing', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          { id: 'peer', text: 'peer', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('j')
    await expect(editor).toHaveClass(/node-input-image-caret/)

    await editor.press('u')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('Control+r')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('Control+o')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(node(window, 2)).not.toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-noop-image-caret-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-noop-image-caret-dark.png')

    await editor.press('V')
    await editor.press('Escape')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('k')
    await expect(editor).toHaveJSProperty('selectionStart', 1)
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
  })

  test('clears a stale image caret after entering a childless attached node with gd', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)

    await window.keyboard.press('g')
    await window.keyboard.press('d')

    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('ab')
    await expect(parent).not.toHaveClass(/node-input-image-caret/)
  })

  test('clears a stale image caret after entering a childless attached node by clicking its enter control', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)

    await window.getByRole('button', { name: 'Enter node 1' }).click()

    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('ab')
    await expect(parent).not.toHaveClass(/node-input-image-caret/)
  })

  test('clears a stale image caret after navigating to an ancestor from the location breadcrumb', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'grandparent',
            text: 'Grandparent',
            children: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
          },
        ],
      },
      location: { currentParentId: 'grandparent', selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('ab')
    await setCursor(parent, 1)
    await parent.press('l')
    await expect(parent).toHaveClass(/node-input-image-caret/)

    await window.getByRole('button', { name: 'Grandparent' }).click()

    const newParent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(newParent).toHaveValue('Grandparent')
    const rootRow = node(window, 1)
    await expect(rootRow).toHaveValue('ab')
    await expect(rootRow).not.toHaveClass(/node-input-image-caret/)
  })

  test('clears a stale image caret after a whole-node Visual command keeps the same node selected', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)

    await window.keyboard.press('V')
    await window.keyboard.press('U')

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveValue('AB')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
  })

  test('joins nodes with one image onto the retained node and rejects two images without a change', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'plain', text: 'Plain', children: [] },
          { id: 'first', text: 'First', attachment: { id: 'first-image', mimeType: 'image/png' }, children: [] },
          { id: 'second', text: 'Second', attachment: { id: 'second-image', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'plain' },
    })
    seedAttachmentImage(userDataDir, 'first-image')
    seedAttachmentImage(userDataDir, 'second-image')
    const { app, window } = await launchTree(userDataDir)
    const imageButtons = window.getByRole('button', { name: 'Open image preview' })
    await expect(imageButtons).toHaveCount(2)

    // The image of the later node moves to the retained node, and nothing is cleaned up.
    await node(window, 1).focus()
    await pressShifted(window, 'J')
    await expect(node(window, 1)).toHaveValue('Plain First')
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 5)
    await expect(
      window.locator('.node-row[data-node-id="plain"]').getByRole('button', { name: 'Open image preview' }),
    ).toHaveCount(1)
    await expect(imageButtons).toHaveCount(2)

    // Two attached nodes cannot join: the whole join is rejected with the approved message.
    allowRendererError(exactMessage('Operation failed: Cannot join nodes that both have attachments'))
    await pressShifted(window, 'J')
    await expect(window.getByText('Operation failed: Cannot join nodes that both have attachments')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('Plain First')
    await expect(node(window, 2)).toHaveValue('Second')
    await expect(imageButtons).toHaveCount(2)

    // A structural change saves on quit: the saved document holds the carried image, and both files remain.
    await closeApp(app)
    expect(readPersisted(userDataDir).document.roots.map((root) => [root.id, root.attachment?.id])).toEqual([
      ['plain', 'first-image'],
      ['second', 'second-image'],
    ])
    expect(attachmentFiles(userDataDir)).toHaveLength(2)
  })
})
