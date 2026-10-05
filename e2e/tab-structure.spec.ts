// @editing-modes: both
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeForEachEditingMode, expect, launchTree, node, parent, seedDocument, test } from './fixtures'
import { attachmentPath } from './fixtures'

function seedSiblings(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'a', text: 'Alpha', children: [] },
        { id: 'b', text: 'Bravo', children: [] },
        { id: 'c', text: 'Charlie', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'b' },
  })
}

function seedSelectedFirstRoot(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'a', text: 'Alpha', children: [] },
        { id: 'b', text: 'Bravo', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'a' },
  })
}

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
  'base64',
)

describeForEachEditingMode('node editor Tab structure commands', ({ mode }) => {
  const states =
    mode === 'vim' ? (['normal', 'insert', 'replace', 'visual', 'visual-node'] as const) : (['standard'] as const)

  for (const state of states) {
    test(`indents and outdents the focused ${state} node while preserving its mode`, async ({ userDataDir }) => {
      seedSiblings(userDataDir)
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const input = window.locator('.node-row[data-node-id="b"] .node-input')
      await input.focus()
      if (state === 'standard')
        await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(1, 3))
      else await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(5, 5))

      if (state === 'insert') await window.keyboard.press('i')
      if (state === 'replace') {
        await window.keyboard.press('R')
        await window.keyboard.type('x')
      }
      if (state === 'visual') await window.keyboard.press('v')
      if (state === 'visual-node') {
        await window.keyboard.press('V')
        await window.keyboard.press('j')
      }
      const selectionBeforeShift = await input.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement
        return [textarea.selectionStart, textarea.selectionEnd]
      })

      await window.keyboard.press('Tab')
      if (state === 'replace') {
        await expect(input).toHaveValue('Bravox')
        await expect
          .poll(() =>
            input.evaluate((element) => {
              const textarea = element as HTMLTextAreaElement
              return [textarea.selectionStart, textarea.selectionEnd]
            }),
          )
          .toEqual(selectionBeforeShift)
        await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
        await window.keyboard.type('y')
        await expect(input).toHaveValue('Bravoxy')
        await window.keyboard.press('Escape')
      }
      if (state === 'standard' || state === 'visual')
        await expect
          .poll(() =>
            input.evaluate((element) => {
              const textarea = element as HTMLTextAreaElement
              return [textarea.selectionStart, textarea.selectionEnd]
            }),
          )
          .toEqual(selectionBeforeShift)
      if (state === 'visual-node') {
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
        await expect(window.locator('.node-row[data-node-id="c"]')).toHaveAttribute('data-depth', '1')
      } else {
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
      }
      if (state === 'standard') {
        const screenshot = await window.locator('.node-list').screenshot()
        await test.info().attach('tab-indent-standard.png', { body: screenshot, contentType: 'image/png' })
      }

      if (state === 'standard') {
        await input.evaluate((element) => {
          const textarea = element as HTMLTextAreaElement
          textarea.setSelectionRange(textarea.value.length, textarea.value.length)
        })
        await window.keyboard.type('!')
        await expect(input).toHaveValue('Bravo!')
      } else if (state === 'insert') {
        await window.keyboard.type('!')
        await expect(input).toHaveValue('Bravo!')
        await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
      } else if (state !== 'replace') {
        const expected = state === 'normal' ? 'NORMAL' : state === 'visual' ? 'VISUAL' : 'VISUAL NODE'
        await expect(window.getByLabel('Vim mode')).toHaveText(expected)
      }

      await window.keyboard.press('Shift+Tab')
      if (state !== 'visual-node')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
      else {
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
        await expect(window.locator('.node-row[data-node-id="c"]')).toHaveAttribute('data-depth', '0')
      }
      if (state !== 'standard') {
        const expected =
          state === 'normal' || state === 'replace'
            ? 'NORMAL'
            : state === 'insert'
              ? 'INSERT'
              : state === 'visual'
                ? 'VISUAL'
                : 'VISUAL NODE'
        await expect(window.getByLabel('Vim mode')).toHaveText(expected)
      }
      await expect(
        state === 'visual-node' ? window.locator('.node-row[data-node-id="c"] .node-input') : input,
      ).toBeFocused()

      if (state === 'standard' || state === 'insert') {
        if (state === 'insert') await window.keyboard.press('Escape')
        await window.keyboard.press('Meta+z')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
        await expect(input).toHaveValue('Bravo!')
        await window.keyboard.press('Meta+z')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
        await expect(input).toHaveValue('Bravo')
        await window.keyboard.press('Meta+z')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
      }

      if (state === 'replace') {
        await window.keyboard.press('Meta+z')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
        await expect(input).toHaveValue('Bravoxy')
        await window.keyboard.press('Meta+z')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
        await expect(input).toHaveValue('Bravox')
        await window.keyboard.press('Meta+z')
        await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
        await expect(input).toHaveValue('Bravox')
        await window.keyboard.press('Meta+z')
        await expect(input).toHaveValue('Bravo')
      }
    })
  }

  test('consumes impossible root Tab and Shift+Tab moves while retaining the focused editor', async ({
    userDataDir,
  }) => {
    seedSelectedFirstRoot(userDataDir)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.locator('.node-row[data-node-id="a"] .node-input')
    await expect(input).toBeFocused()

    await window.keyboard.press('Tab')
    await window.keyboard.press('Shift+Tab')

    await expect(window.locator('.node-row[data-node-id="a"]')).toHaveAttribute('data-depth', '0')
    await expect(input).toBeFocused()
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  for (const state of states) {
    test(`keeps a direct child inside the zoomed current parent with Shift+Tab in ${state}`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            {
              id: 'a',
              text: 'Alpha',
              children: [
                { id: 'b', text: 'Bravo', children: [] },
                { id: 'c', text: 'Charlie', children: [] },
              ],
            },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'a' },
      })
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      await window.keyboard.press('Meta+.')
      await expect(parent(window)).toHaveValue('Alpha')
      const input = node(window, 1)
      await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(0, 0))
      if (state === 'insert') await window.keyboard.press('i')
      if (state === 'replace') {
        await window.keyboard.press('R')
        await window.keyboard.type('x')
        await expect(input).toHaveValue('xravo')
      }
      if (state === 'visual') await window.keyboard.press('v')
      if (state === 'visual-node') {
        await window.keyboard.press('V')
        await window.keyboard.press('j')
      }
      const focusedInput = state === 'visual-node' ? node(window, 2) : input
      await expect(focusedInput).toBeFocused()
      const selectionBefore = await input.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement
        return [textarea.selectionStart, textarea.selectionEnd]
      })

      await window.keyboard.press('Shift+Tab')

      await expect(parent(window)).toHaveValue('Alpha')
      await expect(input).toHaveValue(state === 'replace' ? 'xravo' : 'Bravo')
      await expect(node(window, 2)).toHaveValue('Charlie')
      await expect(focusedInput).toBeFocused()
      if (state === 'standard') {
        const screenshot = await window.locator('.editor-shell').screenshot()
        await test.info().attach('tab-zoom-boundary.png', { body: screenshot, contentType: 'image/png' })
      }
      if (state === 'standard' || state === 'visual' || state === 'replace')
        await expect
          .poll(() =>
            input.evaluate((element) => {
              const textarea = element as HTMLTextAreaElement
              return [textarea.selectionStart, textarea.selectionEnd]
            }),
          )
          .toEqual(selectionBefore)
      if (state !== 'standard')
        await expect(window.getByLabel('Vim mode')).toHaveText(
          state === 'visual-node'
            ? 'VISUAL NODE'
            : state === 'visual'
              ? 'VISUAL'
              : state === 'replace'
                ? 'REPLACE'
                : state === 'insert'
                  ? 'INSERT'
                  : 'NORMAL',
        )

      if (state === 'replace') {
        await window.keyboard.type('y')
        await expect(input).toHaveValue('xyavo')
        await window.keyboard.press('Escape')
        await window.keyboard.press('Meta+z')
        await expect(input).toHaveValue('Bravo')
        await expect(parent(window)).toHaveValue('Alpha')
      } else if (state === 'insert') {
        await window.keyboard.type('!')
        await expect(input).toHaveValue('!Bravo')
        await window.keyboard.press('Escape')
        await window.keyboard.press('Meta+z')
        await expect(input).toHaveValue('Bravo')
        await expect(parent(window)).toHaveValue('Alpha')
      }
    })
  }

  test('outdents a deeper descendant while keeping the zoomed current parent', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'a',
            text: 'Alpha',
            children: [
              { id: 'b', text: 'Bravo', children: [{ id: 'b1', text: 'Bravo child', children: [] }] },
              { id: 'c', text: 'Charlie', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('Meta+.')
    await expect(parent(window)).toHaveValue('Alpha')
    await window.getByRole('button', { name: 'Expand node 1' }).click()
    const descendant = node(window, 2)
    await expect(descendant).toHaveValue('Bravo child')
    await descendant.focus()

    await window.keyboard.press('Shift+Tab')

    await expect(parent(window)).toHaveValue('Alpha')
    await expect(node(window, 1)).toHaveValue('Bravo')
    await expect(node(window, 2)).toHaveValue('Bravo child')
    await expect(node(window, 3)).toHaveValue('Charlie')
    await expect(descendant).toBeFocused()
  })

  if (mode === 'vim') {
    test('keeps an image caret on a direct child when Shift+Tab is blocked by the zoom boundary', async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            {
              id: 'a',
              text: 'Alpha',
              children: [
                { id: 'b', text: 'Bravo', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
                { id: 'c', text: 'Charlie', children: [] },
              ],
            },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'a' },
      })
      mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
      writeFileSync(attachmentPath(userDataDir, 'image'), imageBytes)
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      await window.keyboard.press('Meta+.')
      const input = node(window, 1)
      await expect(parent(window)).toHaveValue('Alpha')
      await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(5, 5))
      await window.keyboard.press('l')
      await expect(input).toHaveClass(/node-input-image-caret/)

      await window.keyboard.press('Shift+Tab')

      await expect(parent(window)).toHaveValue('Alpha')
      await expect(input).toHaveClass(/node-input-image-caret/)
      await expect(input).toHaveJSProperty('selectionStart', 5)
    })
  }

  if (mode === 'vim') {
    test('keeps native Tab traversal from status-bar focus outside the editor', async ({ userDataDir }) => {
      const { window } = await launchTree(userDataDir)
      const pinToggle = window.getByRole('button', { name: 'Pin window on top' })
      const vimToggle = window.getByRole('button', { name: 'Disable Vim editing' })
      await vimToggle.focus()

      await window.keyboard.press('Tab')
      await expect(pinToggle).toBeFocused()
      await window.keyboard.press('Shift+Tab')
      await expect(vimToggle).toBeFocused()
    })

    test('moves an active image caret with Tab and restores its saved text position', async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'a', text: 'Alpha', children: [] },
            { id: 'b', text: 'Bravo', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'b' },
      })
      mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
      writeFileSync(attachmentPath(userDataDir, 'image'), imageBytes)
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const input = node(window, 2)
      await input.focus()
      await input.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(1, 1))
      await window.keyboard.press('$')
      await window.keyboard.press('l')
      await expect(input).toHaveClass(/node-input-image-caret/)

      await window.keyboard.press('Tab')
      await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
      await expect(input).toHaveClass(/node-input-image-caret/)
      await window.keyboard.press('Shift+Tab')
      await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
      await expect(input).toHaveClass(/node-input-image-caret/)
      await expect(input).toHaveJSProperty('selectionStart', 5)
      await window.keyboard.press('k')
      await expect(input).not.toHaveClass(/node-input-image-caret/)
      await expect(input).toHaveJSProperty('selectionStart', 4)
    })
  }
})
