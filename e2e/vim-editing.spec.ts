import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allowRendererError,
  attachmentPath,
  exactMessage,
  expect,
  launchTree as launchTreeBase,
  node,
  seedDocument,
  setMainWindowBounds,
  setCursor,
  test,
  typeInto,
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

test.describe('Vim editing prototype', () => {
  test('uses o to create and focus a child node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'ancestor', text: 'Ancestor', children: [{ id: 'parent', text: 'Parent', children: [] }] }],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir)
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await parent.focus()
    await window.keyboard.press('o')
    await typeInto(node(window, 1), 'Child')
    await window.keyboard.press('Escape')

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Parent')
    await expect(node(window, 1)).toHaveValue('Child')
  })

  test('uses o to create a sibling below a selected child node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'parent', text: 'Parent', children: [{ id: 'first', text: 'First', children: [] }] }],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('o')
    await typeInto(node(window, 2), 'Second')
    await window.keyboard.press('Escape')

    await expect(node(window, 1)).toHaveValue('First')
    await expect(node(window, 2)).toHaveValue('Second')
  })

  test('applies a counted Normal-mode node motion before the next command', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'second', text: 'Second', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('2')
    await window.keyboard.press('j')
    await expect(node(window, 2)).toBeFocused()
    await window.keyboard.press('l')

    await expect(node(window, 2)).toHaveJSProperty('selectionStart', 1)
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
  })

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

  test('moves G to the image on the last node when it has one', async ({ userDataDir }) => {
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
    await expect(node(window, 2)).toHaveJSProperty('selectionStart', 4)
    await expect(node(window, 2)).toHaveJSProperty('selectionEnd', 4)
    await expect(node(window, 2)).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="last"] .attachment-image-caret')).toHaveCount(1)
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

  test('keeps the image as the sole character after deleting its only text', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'a', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await editor.press('x')

    await expect(editor).toHaveValue('')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="root"] .attachment-image-caret')).toHaveCount(1)
    await editor.press('h')
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

  test('synchronizes image caret destinations after gg and viewport motions', async ({ userDataDir }) => {
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
    await expect(first).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-row[data-node-id="first"] .attachment-image-caret')).toHaveCount(1)

    await first.press('G')
    await last.press('H')
    await expect(first).toBeFocused()
    await expect(first).toHaveClass(/node-input-image-caret/)
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
    await expect(last).toHaveClass(/node-input-image-caret/)
    await last.press('k')
    await expect(last).toHaveJSProperty('selectionStart', 5)
    await expect(last).toHaveJSProperty('selectionEnd', 6)
  })

  test('applies counts to node motions and subtree puts', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 12 }, (_, index) => ({
          id: `node-${index + 1}`,
          text: `Node ${index + 1}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'node-1' },
    })
    const { window } = await launchTree(userDataDir)
    const countedNode = (index: number) => window.getByRole('textbox', { name: `Node ${index}`, exact: true })
    await countedNode(1).focus()

    await window.keyboard.press('3')
    await window.keyboard.press('j')
    await expect(countedNode(4)).toBeFocused()
    await window.keyboard.press('5')
    await window.keyboard.press('k')
    await expect(countedNode(1)).toBeFocused()
    await window.keyboard.press('1')
    await window.keyboard.press('0')
    await window.keyboard.press('G')
    await expect(countedNode(10)).toBeFocused()

    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await window.keyboard.press('2')
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('3')
    await window.keyboard.press('p')
    await expect(window.locator('.node-row')).toHaveCount(18)
  })

  test('deletes a counted forward sibling range with dd', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'second', text: 'Second', children: [] },
          { id: 'third', text: 'Third', children: [] },
          { id: 'fourth', text: 'Fourth', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('3')
    await window.keyboard.press('d')
    await window.keyboard.press('d')

    await expect(window.locator('.node-row')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Fourth')
  })

  test('does nothing when O is pressed on the current-parent heading', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir)
    const heading = window.getByRole('textbox', { name: 'Current parent' })
    await heading.focus()
    await window.keyboard.press('O')

    await expect(heading).toHaveValue('Parent')
    await expect(window.locator('.node-row')).toHaveCount(1)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('focuses the current parent with gg from a nested level', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'first', text: 'First child', children: [] },
              { id: 'second', text: 'Second child', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'second' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 2).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('g')

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Parent')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toBeFocused()
  })

  test('uses word, quote, and bracket text objects in Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one (two) "three"', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 6)
    await window.keyboard.press('d')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await expect(editor).toHaveValue('one () "three"')
    await setCursor(editor, 5)
    await window.keyboard.press('d')
    await window.keyboard.press('a')
    await window.keyboard.press('(')
    await expect(editor).toHaveValue('one  "three"')
    await setCursor(editor, 7)
    await window.keyboard.press('c')
    await window.keyboard.press('i')
    await window.keyboard.press('"')
    await typeInto(editor, 'four')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('one  "four"')
  })

  test('selects an inner text object in character Visual mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one (two)', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 6)
    await window.keyboard.press('v')
    await window.keyboard.press('i')
    await window.keyboard.press('(')
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 8)
    await window.keyboard.press('y')
    await window.keyboard.press('P')
    await expect(editor).toHaveValue('one (twotwo)')
  })

  test('repeats dd and subtree puts with fresh IDs', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('G')
    await window.keyboard.press('p')
    const firstCopyId = await window.locator('.node-row').last().getAttribute('data-node-id')
    await window.keyboard.press('.')
    await expect(node(window, 5)).toHaveValue('A')
    const secondCopyId = await window.locator('.node-row').last().getAttribute('data-node-id')
    expect(secondCopyId).not.toBe(firstCopyId)
    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await window.keyboard.press('.')
    await expect(node(window, 1)).toHaveValue('C')
  })

  test('selects complete sibling subtrees with V and repeats their deletion', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'a-child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
          { id: 'd', text: 'D', children: [] },
          { id: 'e', text: 'E', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('j')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('C')
    await window.keyboard.press('.')
    await expect(node(window, 1)).toHaveValue('E')
    await window.keyboard.press('u')
    await expect(node(window, 1)).toHaveValue('C')
    await expect(node(window, 2)).toHaveValue('D')
  })

  test('uses the whole-node yellow highlight for character-wise Visual mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Visual selection', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('V')
    const wholeNodeBackground = await window
      .locator('.node-row-visual-selected')
      .evaluate((element) => element.ownerDocument.defaultView?.getComputedStyle(element).backgroundColor)
    const wholeNodeColors = await window.locator('.node-row-visual-selected').evaluate((element) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return { background: style?.backgroundColor, color: style?.color }
    })
    const visualNodeLabelColors = await window.getByLabel('Vim mode').evaluate((element) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return { background: style?.backgroundColor, color: style?.color }
    })
    expect(visualNodeLabelColors).toEqual(wholeNodeColors)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    const characterSelectionBackground = await editor.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::selection').backgroundColor,
    )
    const visualLabel = window.getByLabel('Vim mode')
    const visualLabelColors = await visualLabel.evaluate((element) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return { background: style?.backgroundColor, color: style?.color }
    })
    expect(characterSelectionBackground).toBe(wholeNodeBackground)
    expect(visualLabelColors).toEqual(wholeNodeColors)
    await expect(editor).toHaveScreenshot('vim-visual-selection-yellow-light.png')
    await expect(visualLabel).toHaveScreenshot('vim-visual-label-yellow-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(editor).toHaveScreenshot('vim-visual-selection-yellow-dark.png')
    await expect(visualLabel).toHaveScreenshot('vim-visual-label-yellow-dark.png')
  })

  test('yanks reverse V ranges, puts node forests, and replaces a V range with fresh IDs', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'a-child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('k')
    await window.keyboard.press('y')
    await window.keyboard.press('G')
    await window.keyboard.press('P')
    await expect(node(window, 3)).toHaveValue('A')
    await expect(node(window, 4)).toHaveValue('B')
    const firstCopyId = await window.locator('.node-row').nth(2).getAttribute('data-node-id')
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('p')
    await expect(node(window, 3)).toHaveValue('A')
    await expect(node(window, 4)).toHaveValue('B')
    expect(await window.locator('.node-row').nth(2).getAttribute('data-node-id')).not.toBe(firstCopyId)
    await window.keyboard.press('.')
    await expect(node(window, 3)).toHaveValue('A')
    await expect(node(window, 4)).toHaveValue('B')
  })

  test('changes whole selected subtrees and keeps the current-parent heading out of V', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'one', children: [{ id: 'grandchild', text: 'mixed', children: [] }] },
              { id: 'b', text: 'two', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await parent.focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('U')
    await expect(node(window, 1)).toHaveValue('ONE')
    await expect(node(window, 2)).toHaveValue('TWO')
    await node(window, 1).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('MIXED')
  })

  test('repeats open-sibling text and rejects a subtree put into its descendant', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    allowRendererError(exactMessage('Operation failed: Cannot paste a node into one of its descendants.'))
    await window.keyboard.press('p')
    await expect(window.getByText('Operation failed: Cannot paste a node into one of its descendants.')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('Child')
    await window.keyboard.press('Control+o')
    await window.keyboard.press('o')
    await typeInto(node(window, 2), 'New')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(node(window, 2)).toHaveValue('New')
    await expect(node(window, 3)).toHaveValue('New')
  })
  test('starts in Normal mode', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveCSS('caret-color', 'rgb(55, 63, 67)')
    await expect(editor).toHaveCSS('caret-animation', 'manual')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 0)
  })

  test('shows the Normal-mode block caret on individual hyperlink characters', async ({ userDataDir }) => {
    const text = 'https://example.test'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text,
            links: [{ start: 0, end: text.length, url: text }],
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await expect(link).not.toHaveClass(/link-selected/)
    expect(
      await editor.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        return selection?.toString()
      }),
    ).toBe('h')

    await editor.press('$')

    expect(await editor.evaluate((field) => field.ownerDocument.defaultView?.getSelection()?.toString())).toBe('t')
    await expect(link).not.toHaveClass(/link-selected/)
  })

  test('crosses a hyperlink one character at a time', async ({ userDataDir }) => {
    const url = 'https://example.test/a/very/long/path/that/does/not/fit/on/one/line'
    const text = `before ${url} after`
    const start = text.indexOf(url)
    const end = start + url.length
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start, end, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const caret = () =>
      editor.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        const range = selection.getRangeAt(0)
        const before = field.ownerDocument.createRange()
        before.selectNodeContents(field)
        before.setEnd(range.startContainer, range.startOffset)
        return before.toString().length
      })

    await editor.focus()
    await editor.press('0')
    await editor.press(String(start))
    await editor.press('l')
    expect(await caret()).toBe(start)
    await editor.press('l')
    expect(await caret()).toBe(start + 1)

    await editor.press('h')
    expect(await caret()).toBe(start)
    await editor.press('$')
    expect(await caret()).toBe(text.length - 1)
    await setCursor(editor, end - 1)
    await editor.press('l')
    expect(await caret()).toBe(end)
  })

  test('keeps the Normal caret on the selected linked node while h and l traverse it', async ({ userDataDir }) => {
    const url = 'https://example.test/usage'
    const text = `test ${url}\n${url} after`
    const firstStart = text.indexOf(url)
    const secondStart = text.indexOf(url, firstStart + url.length)
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'empty', text: '', children: [] },
          {
            id: 'linked',
            text,
            links: [
              { start: firstStart, end: firstStart + url.length, url },
              { start: secondStart, end: secondStart + url.length, url },
            ],
            children: [],
          },
          { id: 'next', text: 'next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'empty' },
    })
    const { window } = await launchTree(userDataDir)
    const empty = node(window, 1)
    const linked = node(window, 2)
    const links = linked.getByRole('link')
    const caret = () =>
      linked.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        const range = selection.getRangeAt(0)
        const before = field.ownerDocument.createRange()
        before.selectNodeContents(field)
        before.setEnd(range.startContainer, range.startOffset)
        return before.toString().length
      })
    await expect(empty).toBeFocused()
    await empty.press('j')
    await expect(linked).toBeFocused()
    await expect(window.locator('.node-row').nth(1).locator('.node-focus-marker')).toHaveCount(1)
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(0)

    await linked.press('l')
    expect(await caret()).toBe(1)
    await setCursor(linked, firstStart)
    await linked.press('h')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart - 1)
    await linked.press('l')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart)
    await linked.press('l')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart + 1)
    await linked.press('h')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart)
    await expect(empty).not.toBeFocused()
    await linked.press('k')
    await expect(empty).toBeFocused()
    await expect(links.first()).not.toHaveClass(/link-selected/)
    await empty.press('j')
    await expect(linked).toBeFocused()
    await expect(links.first()).not.toHaveClass(/link-selected/)
  })

  test('keeps the Normal-mode linked character visible in dark appearance', async ({ userDataDir }) => {
    const text = 'https://example.test'
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start: 0, end: text.length, url: text }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTreeBase(userDataDir, { initialMode: 'normal' })
    await window.emulateMedia({ colorScheme: 'dark' })
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await expect(link).not.toHaveClass(/link-selected/)
    await expect
      .poll(() =>
        link.evaluate(
          (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::selection').backgroundColor,
        ),
      )
      .toBe('rgb(55, 63, 67)')
    await expect(editor).toHaveScreenshot('vim-normal-link-character-dark.png')
  })

  test('matches the Visual-mode selection color across a selected hyperlink', async ({ userDataDir }) => {
    const url = 'https://example.test'
    const text = `go to ${url} now`
    const start = text.indexOf(url)
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start, end: start + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('$')

    await expect(link).toHaveClass(/link-selected/)
    const linkBackground = await link.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element).backgroundColor,
    )
    const textSelectionBackground = await editor.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::selection').backgroundColor,
    )
    expect(linkBackground).toBe(textSelectionBackground)
  })

  test('keeps the Normal-mode linked selection on the focused node', async ({ userDataDir }) => {
    const firstText = 'Start https://first.example end'
    const secondText = 'Open https://second.example now'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'first',
            text: firstText,
            links: [{ start: 6, end: 27, url: 'https://first.example' }],
            children: [],
          },
          {
            id: 'second',
            text: secondText,
            links: [{ start: 5, end: 27, url: 'https://second.example' }],
            children: [],
          },
          { id: 'third', text: 'A neighboring plain node', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const second = node(window, 2)
    const hasLinkedSelection = (field: HTMLElement): boolean => {
      const selection = field.ownerDocument.defaultView?.getSelection()
      return (
        selection?.anchorNode !== null && selection?.anchorNode !== undefined && field.contains(selection.anchorNode)
      )
    }

    await first.press('6')
    await first.press('l')
    expect(await first.evaluate(hasLinkedSelection)).toBe(true)
    expect(await second.evaluate(hasLinkedSelection)).toBe(false)

    await second.focus()
    await second.press('0')
    await second.press('5')
    await second.press('l')
    expect(await first.evaluate(hasLinkedSelection)).toBe(false)
    expect(await second.evaluate(hasLinkedSelection)).toBe(true)

    await first.focus()
    await first.press('0')
    await first.press('6')
    await first.press('l')
    expect(await first.evaluate(hasLinkedSelection)).toBe(true)
    expect(await second.evaluate(hasLinkedSelection)).toBe(false)
  })

  test('keeps the Normal-mode linked character on one line through wrapping and resize', async ({ userDataDir }) => {
    const firstUrl = `https://example.test/${'wrapped-segment-'.repeat(10)}`
    const secondUrl = `https://sample.test/${'neighbor-segment-'.repeat(10)}`
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: firstUrl, links: [{ start: 0, end: firstUrl.length, url: firstUrl }], children: [] },
          {
            id: 'second',
            text: secondUrl,
            links: [{ start: 0, end: secondUrl.length, url: secondUrl }],
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { app, window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const second = node(window, 2)
    const firstLink = first.getByRole('link')
    const selectedCharacter = () =>
      first.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        if (!selection || selection.rangeCount === 0) return undefined
        const rects = selection.getRangeAt(0).getClientRects()
        const rect = rects[0]
        return { text: selection.toString(), width: rect?.width ?? 0, height: rect?.height ?? 0 }
      })

    expect(await firstLink.evaluate((link) => link.getClientRects().length)).toBeGreaterThan(1)
    expect(await selectedCharacter()).toMatchObject({ text: 'h' })
    expect((await selectedCharacter())?.width).toBeGreaterThan(0)
    await first.press('$')
    expect(await selectedCharacter()).toMatchObject({ text: '-' })
    expect((await selectedCharacter())?.width).toBeGreaterThan(0)

    await second.focus()
    await expect(second).toBeFocused()
    await first.focus()
    await window.emulateMedia({ colorScheme: 'dark' })
    await first.press('$')
    await setMainWindowBounds(app, { width: 680 })
    await expect.poll(async () => (await selectedCharacter())?.width ?? 0).toBeGreaterThan(0)
    expect((await selectedCharacter())?.height).toBeLessThanOrEqual(21)
  })

  test('leaves the current node with Ctrl+o', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Root')
    await expect(node(window, 1)).toHaveValue('Child')
    await node(window, 1).focus()

    await window.keyboard.press('Control+o')

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveCount(0)
    await expect(node(window, 1)).toHaveValue('Root')
    await expect(node(window, 1)).toBeFocused()
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

  test('supports line and viewport motions', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await node(window, 1).press('i')
    await typeInto(node(window, 1), 'one')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'two')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'three')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 4), 'four')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 5), 'five')
    await window.keyboard.press('Escape')

    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await expect(node(window, 1)).toBeFocused()

    await window.keyboard.press('G')
    await expect(node(window, 5)).toBeFocused()
    await window.keyboard.press('H')
    await expect(node(window, 1)).toBeFocused()
    await window.keyboard.press('M')
    await expect(node(window, 3)).toBeFocused()
    await window.keyboard.press('L')
    await expect(node(window, 5)).toBeFocused()
    await window.keyboard.press('Control+u')
    await expect(node(window, 3)).toBeFocused()
    await window.keyboard.press('Control+d')
    await expect(node(window, 5)).toBeFocused()
  })

  test('switches modes and applies Normal-mode motions and edits', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'one two')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
    await window.keyboard.press('Backspace')
    await expect(editor).toHaveValue('one two')

    await window.keyboard.press('w')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('one wo')

    await window.keyboard.press('i')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('T')
    await expect(editor).toHaveValue('one Two')
  })

  test('undoes with u and redoes with Ctrl+r in Normal mode', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await window.keyboard.press('Escape')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('ab')

    await window.keyboard.press('u')
    await expect(editor).toHaveValue('abc')
    await window.keyboard.press('Control+r')
    await expect(editor).toHaveValue('ab')
  })

  test('undoes two separate Vim character replacements without an empty history step', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'ab', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)

    await editor.press('r')
    await editor.press('q')
    await expect(editor).toHaveValue('qb')
    await editor.press('l')
    await editor.press('r')
    await editor.press('Z')
    await expect(editor).toHaveValue('qZ')

    await editor.press('u')
    await expect(editor).toHaveValue('qb')
    await editor.press('u')
    await expect(editor).toHaveValue('ab')
    await editor.press('Control+r')
    await expect(editor).toHaveValue('qb')
  })

  test('clears a stale image caret after undo and redo', async ({ userDataDir }) => {
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

    await editor.press('u')
    await expect(editor).toHaveValue('ab')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)

    await editor.press('Control+r')
    await expect(editor).toHaveValue('a')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
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

  test('clears a stale image caret after entering a childless attached node with Cmd+.', async ({ userDataDir }) => {
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

    await window.keyboard.press('Meta+.')

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

  test('A enters Insert mode at the end of the node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'one two')
    await setCursor(editor, 1)
    await window.keyboard.press('Escape')
    await window.keyboard.press('A')
    await window.keyboard.type('!')

    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(editor).toHaveValue('one two!')
    await expect(editor).toHaveJSProperty('selectionStart', 8)
    await expect(editor).toHaveJSProperty('selectionEnd', 8)
  })

  test('o and O open empty siblings below and above', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'middle')
    await window.keyboard.press('Escape')
    await window.keyboard.press('o')
    await window.keyboard.type('below')
    await expect(node(window, 1)).toHaveValue('middle')
    await expect(node(window, 2)).toHaveValue('below')

    await window.keyboard.press('Escape')
    await window.keyboard.press('O')
    await window.keyboard.type('above')
    await expect(node(window, 1)).toHaveValue('middle')
    await expect(node(window, 2)).toHaveValue('above')
    await expect(node(window, 3)).toHaveValue('below')
  })

  test('I enters Insert mode at the first non-whitespace character', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, '  one')
    await setCursor(editor, 4)
    await window.keyboard.press('Escape')
    await window.keyboard.press('I')
    await window.keyboard.type('X')

    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(editor).toHaveValue('  Xone')
  })

  test('yanks a Visual selection and puts it from the local register', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('y')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('$')
    await window.keyboard.press('P')

    await expect(editor).toHaveValue('ababc')
  })

  test('yanks and puts a node subtree with yy, p, and P', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'child', text: 'Child', children: [{ id: 'grandchild', text: 'Grandchild', children: [] }] },
              { id: 'sibling', text: 'Sibling', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('p')
    await expect(node(window, 2)).toHaveValue('Child')

    await window.keyboard.press('P')
    await expect(node(window, 2)).toHaveValue('Child')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Child')
    await expect(node(window, 1)).toHaveValue('Grandchild')
  })

  test('puts the local register after the current character with p', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('y')
    await window.keyboard.press('$')
    await window.keyboard.press('p')

    await expect(editor).toHaveValue('abcab')
  })

  test('keeps backward Visual selections inclusive and $ on the final character', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 2)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('h')
    await window.keyboard.press('d')
    await expect(editor).toHaveValue('c')

    await window.keyboard.press('$')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('')
  })

  test('uses counted text operators while preserving the node and its subtree', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'one two three', children: [{ id: 'child', text: 'Child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('2')
    await window.keyboard.press('d')
    await window.keyboard.press('w')
    await expect(editor).toHaveValue('three')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('Child')
  })

  test('changes words, finds characters, and repeats the completed change', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'one.two three')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('w')
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await window.keyboard.press('f')
    await window.keyboard.press('o')
    await expect(editor).toHaveJSProperty('selectionStart', 6)
    await window.keyboard.press('b')
    await window.keyboard.press('c')
    await window.keyboard.press('w')
    await window.keyboard.type('NEW')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('one.NEW three')
    await window.keyboard.press('w')
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('one.NEW NEW')
  })

  test('replaces, substitutes, and changes through the end of node text', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abc def')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('r')
    await window.keyboard.press('X')
    await expect(editor).toHaveValue('Xbc def')
    await window.keyboard.press('s')
    await window.keyboard.type('Y')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('Ybc def')
    await window.keyboard.press('w')
    await window.keyboard.press('C')
    await window.keyboard.type('tail')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('Ybc tail')
    await window.keyboard.press('D')
    await expect(editor).toHaveValue('Ybc tai')
  })

  test('repeats inserted text and honors a count before dot', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abcdef')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('bcdef')
    for (const key of ['2', '.']) await window.keyboard.press(key)
    await expect(editor).toHaveValue('def')
    await window.keyboard.press('i')
    await window.keyboard.type('Q')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('QQdef')
  })

  test('repeats a deletion-only Insert edit at the same relative caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('i')
    await editor.press('Delete')
    await editor.press('Escape')
    await expect(editor).toHaveValue('acd')
    await expect(editor).toHaveJSProperty('selectionStart', 0)

    await editor.press('l')
    await editor.press('.')
    await expect(editor).toHaveValue('ad')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
  })

  test('changes whole-node text, deletes backward, and repeats counted text puts', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'parent', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('c')
    await window.keyboard.press('c')
    await window.keyboard.type('new')
    await window.keyboard.press('Escape')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('child')
    await window.keyboard.press('Control+o')

    await setCursor(node(window, 1), 2)
    await window.keyboard.press('X')
    await expect(node(window, 1)).toHaveValue('nw')
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('v')
    await window.keyboard.press('y')
    await window.keyboard.press('3')
    await window.keyboard.press('p')
    await expect(node(window, 1)).toHaveValue('nnnnw')
  })

  test('uses WORD, ge, and repeated character-find motions', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'foo.bar  baz.baz')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('W')
    await expect(editor).toHaveJSProperty('selectionStart', 9)
    await window.keyboard.press('f')
    await window.keyboard.press('.')
    await window.keyboard.press(';')
    await expect(editor).toHaveJSProperty('selectionStart', 12)
    await window.keyboard.press(',')
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await window.keyboard.press('W')
    await window.keyboard.press('g')
    await window.keyboard.press('e')
    await expect(editor).toHaveJSProperty('selectionStart', 6)
  })

  test('replaces text in Replace mode and repeats the completed session', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abcd')
    await setCursor(editor, 2)
    await window.keyboard.press('Escape')
    await window.keyboard.press('R')
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('XY')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('aXYd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)
    await setCursor(editor, 0)
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('XYYd')
  })

  test('leaves an image caret on replacement text after Escape', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
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
    await window.keyboard.press('R')
    await window.keyboard.type('XY')
    await window.keyboard.press('Escape')

    await expect(editor).toHaveValue('abcdXY')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('h')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
  })

  test('clears the image caret when a pending Replace session commits on blur', async ({ userDataDir }) => {
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
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await node(window, 2).click()

    await expect(editor).toHaveValue('abcdX')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(node(window, 2)).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('activates the image caret when a Replace session commits on blur to a non-node target', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
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
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await window.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })

    await expect(editor).toHaveValue('abcdX')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-blur-image-caret-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-blur-image-caret-dark.png')
  })

  test('activates the image caret when a same-node pointer click commits a Replace session', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
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
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await editor.click()
    await window.keyboard.press('Escape')

    await expect(editor).toHaveValue('abcdX')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-click-image-caret-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-click-image-caret-dark.png')
  })

  test('undoes a pending Replace-mode edit and focuses the restored text', async ({ userDataDir }) => {
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
    await window.keyboard.press('R')
    await window.keyboard.type('XY')
    await expect(editor).toHaveValue('abcdXY')

    await window.keyboard.press('Meta+z')

    await expect(editor).toHaveValue('abcd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
    const restoredList = window.locator('.node-list')
    await expect(restoredList).toHaveScreenshot('vim-replace-undo-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(restoredList).toHaveScreenshot('vim-replace-undo-dark.png')
  })

  test('ends a pending Replace session on Cmd+Shift+Z with a valid Normal caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
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
    await window.keyboard.press('R')
    await window.keyboard.type('XY')

    await window.keyboard.press('Meta+Shift+z')

    await expect(editor).toHaveValue('abcdXY')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('h')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
  })

  test('commits a pending Replace session before Cmd+. enters the selected node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('R')
    await window.keyboard.type('X')

    await window.keyboard.press('Meta+.')

    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('Xb')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('commits a pending Replace session before entering the node with its enter control', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('R')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Enter node 1' }).click()

    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('Xb')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('commits a pending Replace session before Cmd+Backspace deletes the node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'ab', children: [] },
          { id: 'peer', text: 'peer', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('R')
    await window.keyboard.type('X')

    await window.keyboard.press('Meta+Backspace')
    await expect(node(window, 1)).toHaveValue('peer')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('Xb')
  })

  test('changes, replaces, swaps, and cases a Visual selection', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'AbCd')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('o')
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('abCd')

    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('y')
    await window.keyboard.press('$')
    await window.keyboard.press('v')
    await window.keyboard.press('h')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('abab')

    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('c')
    await window.keyboard.type('Z')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('Zab')
  })

  test('repeats a deletion made inside an Insert session', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abcd')
    await setCursor(editor, 2)
    await window.keyboard.press('Escape')
    await window.keyboard.press('i')
    await window.keyboard.press('Backspace')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('bcd')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('bd')
  })

  test('does not record a cross-node Insert session as a repeatable text edit', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await node(window, 1).press('i')
    await typeInto(node(window, 1), 'one')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'two')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(node(window, 1)).toHaveValue('one')
    await expect(node(window, 2)).toHaveValue('two')
  })
  test('does not record a plain Insert session as repeatable after entering the node with its enter control', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await editor.press('i')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Enter node 1' }).click()

    const childEditor = node(window, 1)
    await expect(childEditor).toHaveValue('child')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(childEditor).toHaveValue('child')
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('Xab')
  })

  test('does not record a plain Insert session as repeatable after a breadcrumb navigates to an ancestor', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'ab', children: [] }] }],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await editor.press('i')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Top level' }).click()

    const rootEditor = node(window, 1)
    await expect(rootEditor).toHaveValue('Root')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(rootEditor).toHaveValue('Root')
  })

  test('adds, changes, and deletes surrounding pairs in Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one two three', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 4)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await window.keyboard.press('"')
    await expect(editor).toHaveValue('one "two" three')

    await setCursor(editor, 5)
    await window.keyboard.press('c')
    await window.keyboard.press('s')
    await window.keyboard.press('"')
    await window.keyboard.press(')')
    await expect(editor).toHaveValue('one (two) three')

    await setCursor(editor, 5)
    await window.keyboard.press('d')
    await window.keyboard.press('s')
    await window.keyboard.press(')')
    await expect(editor).toHaveValue('one two three')

    // The opening bracket pads the inside; its closing counterpart does not.
    await setCursor(editor, 4)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await window.keyboard.press('{')
    await expect(editor).toHaveValue('one { two } three')

    // Deleting with the opening key strips that padding again.
    await setCursor(editor, 6)
    await window.keyboard.press('d')
    await window.keyboard.press('s')
    await window.keyboard.press('{')
    await expect(editor).toHaveValue('one two three')
  })

  test('surrounds the whole node with yss and repeats a surround with dot', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'alpha beta', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 3)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('s')
    await window.keyboard.press(')')
    await expect(editor).toHaveValue('(alpha beta)')

    await window.keyboard.press('u')
    await expect(editor).toHaveValue('alpha beta')

    await setCursor(editor, 0)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await window.keyboard.press(']')
    await expect(editor).toHaveValue('[alpha] beta')

    // The repeat re-derives the word at the new caret instead of replaying fixed offsets.
    await setCursor(editor, 8)
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('[alpha] [beta]')

    // One surround is one undoable change.
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('[alpha] beta')
  })

  test('surrounds a Visual selection with S', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'see it now', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('S')
    await window.keyboard.press('"')
    await expect(editor).toHaveValue('"see" it now')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('keeps a hyperlink intact when a surround wraps it', async ({ userDataDir }) => {
    const url = 'https://example.test/page'
    const text = `see ${url} now`
    const start = text.indexOf(url)
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'linked', text, links: [{ start, end: start + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'linked' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await expect(editor.getByRole('link')).toHaveCount(1)

    await setCursor(editor, start + 2)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('W')
    await window.keyboard.press(')')

    await expect(editor).toHaveText(`see (${url}) now`)
    const link = editor.getByRole('link')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveAttribute('href', url)
    await expect(link).toHaveText(url)
  })
})
