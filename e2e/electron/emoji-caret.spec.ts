// @editing-modes: both
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  attachmentPath,
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
} from './fixtures'

describeForEachEditingMode('Emoji caret movement', ({ mode }) => {
  if (mode === 'vim') {
    // @requirement PRODUCT.md §4.3
    test('returns from an attached image to a whole final emoji and applies the remaining count', async ({
      userDataDir,
    }, testInfo) => {
      const text = 'A🚀👩‍💻'
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'n', text, attachment: { id: 'image', mimeType: 'image/png' }, children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const path = attachmentPath(userDataDir, 'image')

      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(
        path,
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
          'base64',
        ),
      )
      const { window } = await launchTree(userDataDir)
      const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
      const selection = async () =>
        input.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          return { start: input.selectionStart, end: input.selectionEnd }
        })

      await window.keyboard.press('Escape')
      await window.keyboard.press('0')
      await window.keyboard.type('99')
      await window.keyboard.press('l')

      await expect(input).toHaveClass(/node-input-image-caret/)

      await window.keyboard.press('h')

      await expect(input).not.toHaveClass(/node-input-image-caret/)
      await expect.poll(selection).toEqual({ start: 3, end: 8 })

      await window.screenshot({ path: testInfo.outputPath('emoji-image-return.png') })
      await window.keyboard.press('l')

      await expect(input).toHaveClass(/node-input-image-caret/)

      await window.keyboard.press('2')
      await window.keyboard.press('h')

      await expect.poll(selection).toEqual({ start: 1, end: 3 })

      await window.keyboard.press('i')
      await window.keyboard.type('!')

      await expect(input).toHaveValue('A!🚀👩‍💻')
    })
  }

  for (const view of ['Tree plain', 'Tree rich', 'Agenda'] as const) {
    // @requirement PRODUCT.md §4.3
    // @requirement PRODUCT.md §20.12
    test(`crosses each whole emoji with one horizontal step in ${view}`, async ({ userDataDir }, testInfo) => {
      const prefix = view === 'Tree plain' ? 'A' : '2026-10-08 A'
      const emojis = ['🚀', '👩‍💻', '👍🏽', '🇬🇧']
      const text = `${prefix}${emojis.join('B')}Z`
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'n', text, children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window } = await launchTree(userDataDir)

      await setAgendaToday(window)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input = window.getByRole('textbox', { name: view === 'Agenda' ? 'Agenda node n' : 'Node 1', exact: true })
      const selection = async (): Promise<{ start: number; end: number }> =>
        input.evaluate((element) => {
          if (element instanceof HTMLTextAreaElement)
            return { start: element.selectionStart, end: element.selectionEnd }
          const range = getSelection()!.getRangeAt(0)
          const before = document.createRange()
          before.selectNodeContents(element)
          before.setEnd(range.startContainer, range.startOffset)
          const start = before.toString().length
          return { start, end: start + range.toString().length }
        })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      let start = prefix.length
      for (const emoji of emojis) {
        await setCursor(input, start)
        await window.keyboard.press('ArrowRight')

        await expect.poll(selection).toEqual({ start: start + emoji.length, end: start + emoji.length })

        await window.keyboard.press('ArrowLeft')

        await expect.poll(selection).toEqual({ start, end: start })

        await window.keyboard.press('Shift+ArrowRight')

        await expect.poll(selection).toEqual({ start, end: start + emoji.length })

        start += emoji.length + 1
      }
      if (mode === 'vim') {
        await setCursor(input, 0)
        await window.keyboard.press('Escape')
        await window.keyboard.press('0')
        await window.keyboard.type(String(prefix.length))
        await window.keyboard.press('l')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length + emojis[0]!.length })

        start = prefix.length
        for (const emoji of emojis) {
          await window.keyboard.press('l')

          await expect.poll(selection).toEqual({ start: start + emoji.length, end: start + emoji.length + 1 })

          await window.keyboard.press('h')

          await expect.poll(selection).toEqual({ start, end: start + emoji.length })

          await window.screenshot({ path: testInfo.outputPath(`emoji-${view}-${emoji.codePointAt(0)}-normal.png`) })
          if (emoji === '👩‍💻') {
            await window.emulateMedia({ colorScheme: 'dark' })
            await window.screenshot({ path: testInfo.outputPath(`emoji-${view}-joined-normal-dark.png`) })
            await window.emulateMedia({ colorScheme: 'light' })
          }
          // Advance only to another emoji; after the final one, 2l leaves the Agenda node.
          if (emoji !== emojis.at(-1)) {
            await window.keyboard.press('2')
            await window.keyboard.press('l')
          }
          start += emoji.length + 1
        }

        await window.keyboard.press('0')
        await window.keyboard.type(String(prefix.length))
        await window.keyboard.press('l')
        await window.keyboard.press('v')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length + emojis[0]!.length })

        await window.keyboard.press('l')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length + emojis[0]!.length + 1 })

        await window.keyboard.press('h')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length + emojis[0]!.length })

        await window.keyboard.press('Escape')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length + emojis[0]!.length })

        await window.keyboard.press('g')
        await window.keyboard.press('v')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length + emojis[0]!.length })

        await window.keyboard.press('Escape')
        await window.keyboard.press('a')

        await expect
          .poll(selection)
          .toEqual({ start: prefix.length + emojis[0]!.length, end: prefix.length + emojis[0]!.length })

        await window.keyboard.press('ArrowLeft')

        await expect.poll(selection).toEqual({ start: prefix.length, end: prefix.length })

        await window.keyboard.press('ArrowRight')

        await expect
          .poll(selection)
          .toEqual({ start: prefix.length + emojis[0]!.length, end: prefix.length + emojis[0]!.length })

        await window.keyboard.press('Escape')
        await window.keyboard.press('2')
        await window.keyboard.press('l')
        const joinedStart = prefix.length + emojis[0]!.length + 1

        await window.keyboard.press('v')
        await window.keyboard.press('Escape')
        await window.keyboard.press('g')
        await window.keyboard.press('v')

        await expect.poll(selection).toEqual({ start: joinedStart, end: joinedStart + emojis[1]!.length })

        await window.keyboard.press('d')
        const readText = async () =>
          input.evaluate((element) =>
            element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
          )

        await expect.poll(readText).toBe(text.slice(0, joinedStart) + text.slice(joinedStart + emojis[1]!.length))

        await window.keyboard.press('u')

        await expect.poll(readText).toBe(text)
      }

      await expect(input).toBeFocused()
    })
  }
})
