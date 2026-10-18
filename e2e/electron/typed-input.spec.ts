// @editing-modes: both
import type { Locator } from '@playwright/test'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  seedDocument,
  setCursor,
  test,
  typeInto,
} from './fixtures'

interface Case {
  name: string
  seedText: string
  caret: number
  typed: string
  links: number
}

// Realistic lines typed key by key. A typed character that is lost, doubled, or moved, or a caret that
// does not follow the typing, fails the exact text and caret assertions below.
const CASES: readonly Case[] = [
  {
    name: 'a URL with a path, query, and fragment between words',
    seedText: '',
    caret: 0,
    typed: 'see https://example.com/a/b?x=1&y=2#top now',
    links: 1,
  },
  {
    name: 'operator-like punctuation',
    seedText: '',
    caret: 0,
    typed: 'a -> b => c != d == e <= f >= g :: h // i',
    links: 0,
  },
  {
    name: 'brackets, quotes, and symbols',
    seedText: '',
    caret: 0,
    typed: '(a) [b] {c} "d" \'e\' `f` #{g} ~!@$%^&*',
    links: 0,
  },
  { name: 'repeated slashes and dots', seedText: '', caret: 0, typed: 'path/to//file///x ... :: -- ++', links: 0 },
  {
    name: 'a URL typed in front of an existing word and then a space',
    seedText: 'start end',
    caret: 6,
    typed: 'http://x.com/p ',
    links: 1,
  },
  {
    name: 'two URLs and trailing text',
    seedText: '',
    caret: 0,
    typed: 'http://localhost:8080 https://example.com/x done',
    links: 2,
  },
]

// The caret offset as the user sees it, for both a textarea and the rich editor.
function caretOffset(input: Locator): Promise<number> {
  return input.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) return element.selectionStart
    const selection = element.ownerDocument.getSelection()
    if (selection === null || selection.rangeCount === 0) return -1
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    range.setEnd(selection.anchorNode ?? element, selection.anchorOffset)
    return range.toString().length
  })
}

describeForEachEditingMode('typed input', ({ screenshotName }) => {
  for (const [index, entry] of CASES.entries()) {
    // @requirement PRODUCT.md §13
    test(`types ${entry.name} exactly as typed`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'root', text: entry.seedText, links: [], children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'root' },
      })
      const { window } = await launchTree(userDataDir)
      const editor = node(window, 1)
      await typeInto(editor, '')
      await setCursor(editor, entry.caret)
      await editor.pressSequentially(entry.typed)

      const expected = `${entry.seedText.slice(0, entry.caret)}${entry.typed}${entry.seedText.slice(entry.caret)}`
      await expect(editor).toHaveText(expected)
      await expect(editor.getByRole('link')).toHaveCount(entry.links)
      await expect(editor).toBeFocused()
      expect(await caretOffset(editor)).toBe(entry.caret + entry.typed.length)

      // One picture per mode of the punctuation line, inspected once, guards how it is drawn.
      if (index === 1) await expect(editor).toHaveScreenshot(screenshotName('typed-operator-punctuation.png'))
    })
  }
})
