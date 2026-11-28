// @vitest-environment jsdom
// Vim commands over emoji and combining marks must never split a character (PRODUCT §4.3): each
// command sequence runs from every character start through the real keyboard handler and store.
import type { KeyboardEvent } from 'react'
import { expect, it, vi } from 'vitest'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'
import { setNormalCaret } from './editor-dom'

const TEXT = 'a👍🏽b 👩‍💻 c😀d é'
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
const graphemes = (text: string) => Array.from(segmenter.segment(text), (part) => part.segment)
const boundaries = (text: string) => {
  const result = [0]
  for (const { index, segment } of segmenter.segment(text)) result.push(index + segment.length)
  return result
}
const ALLOWED = new Set([...graphemes(TEXT), 'z', 'Z', ')', '(', 'A', 'B', 'C', 'D', 'E', 'É'])

// `^a` is Ctrl+A; `^c`, `^x`, `^v` in the sequences below are sent as Cmd+C, Cmd+X and Cmd+V.
function keyEvent(input: HTMLElement, raw: string) {
  const command = ['^c', '^x', '^v'].includes(raw)
  const key = raw.replace(/^\^/, '')
  return {
    currentTarget: input,
    key,
    altKey: false,
    ctrlKey: raw.startsWith('^') && !command,
    metaKey: command,
    shiftKey: key.length === 1 && key !== key.toLowerCase(),
    repeat: false,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>
}

async function run(start: number, keys: string[]) {
  const harness = await createRealStoreHarness({ document: { roots: [{ id: 'node', text: TEXT, children: [] }] } })
  const input = document.createElement('textarea')
  input.value = TEXT
  document.body.append(input)
  const double = createVimKeyboardDouble('node', { mode: 'normal' })
  const vim = double.vim
  const publish = vim.applyCaretState
  vim.applyCaretState = vi.fn((id, caret, fromFocus, timing) => {
    publish(id, caret, fromFocus, timing)
    if (timing !== 'preserve-selection') {
      input.value = harness.node().text
      setNormalCaret(input, caret.cursor)
    }
  })
  vim.scheduleCaret = (_input, cursor) => {
    input.value = harness.node().text
    setNormalCaret(input, cursor)
  }
  setNormalCaret(input, start)
  const ranges: string[] = []
  const record =
    (name: string) =>
    (_id: string, from: number, to: number): Promise<boolean> => {
      const valid = boundaries(harness.node().text)
      if (!valid.includes(from) || !valid.includes(to)) ranges.push(`${name} [${from},${to}] off boundary`)
      return Promise.resolve(true)
    }
  vi.spyOn(harness.store, 'copy').mockImplementation(record('copy'))
  vi.spyOn(harness.store, 'cut').mockImplementation(record('cut'))
  for (const key of keys) {
    const handle = createEditorKeyDownHandler({
      store: harness.store,
      node: harness.node(),
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      shiftFocusedNode: vi.fn(),
      vim,
    })
    handle(keyEvent(input, key))
    if (input.value !== harness.node().text) {
      const cursor = input.selectionStart
      input.value = harness.node().text
      input.setSelectionRange(cursor, cursor)
    }
  }
  const text = harness.node().text
  const problems: string[] = [...ranges]
  const bad = graphemes(text).filter((part) => !ALLOWED.has(part))
  if (bad.length > 0) problems.push(`text ${JSON.stringify(text)} has ${JSON.stringify(bad)}`)
  const valid = boundaries(text)
  if (!valid.includes(input.selectionStart) || !valid.includes(input.selectionEnd))
    problems.push(`selection [${input.selectionStart},${input.selectionEnd}] off boundary in ${JSON.stringify(text)}`)
  const state = double.commandState
  for (const end of [state.visualAnchor, state.visualFocus])
    if (end !== undefined && !valid.includes(end)) problems.push(`visual end ${end} off boundary`)
  const register = (vim as unknown as { register?: { current?: { text?: string } } }).register?.current?.text
  if (register !== undefined && graphemes(register).some((part) => !ALLOWED.has(part)))
    problems.push(`register ${JSON.stringify(register)}`)
  input.remove()
  return problems
}

const SEQUENCES = [
  'x',
  'X',
  '2 x',
  '2 X',
  's Escape',
  'r z',
  'R z z Escape',
  '~',
  '3 ~',
  'g ~ l',
  'g u l',
  'g U l',
  'g U w',
  'y l p',
  'y l P',
  'y 2 l p',
  'd l',
  'd h',
  'c l Escape',
  'd w',
  'd e',
  'd b',
  'c w Escape',
  'D',
  'C Escape',
  'w',
  'e',
  'b',
  'g e',
  'W',
  'E',
  'B',
  '$',
  '0',
  '^',
  'l',
  'h',
  '3 l',
  '3 h',
  'f c',
  't c',
  'F a',
  'T a',
  'f c ;',
  'i Escape',
  'a Escape',
  'A Escape',
  'I Escape',
  'v l y P',
  'v l d',
  'v e d',
  'v ~',
  'v U',
  'v u',
  'v r z',
  'v l c Escape',
  'v l o h',
  'v 2 l x',
  'v $ d',
  'v 0 d',
  'v l p',
  'v i w d',
  'v a w d',
  'v l J',
  'y s i w )',
  'y s s (',
  'v l S )',
  'v e y $ p',
  'd l .',
  'x .',
  'x u',
  'x u ^r',
  'v l y g v d',
  'v l Escape g v d',
  'v l > ',
  'g J',
  'v l g J',
  'r z .',
  's Escape .',
  '3 r z',
  '2 s Escape',
  'v 3 l r z',
  'x p',
  'X p',
  'x P',
  'y w P',
  'v l y v l p',
  '~ .',
  'g ~ ~',
  'v i w ~',
  'c i w Escape',
  'd i w',
  'y i w p',
  'd a w',
  'c a w Escape',
  '2 d l',
  'd 2 l',
  'd $',
  'd 0',
  'd ^',
  'c $ Escape',
  'v b d',
  'v w d',
  'v e x',
  'v l s Escape',
  'v l X',
  'v l D',
  'v l Y p',
  'v h d',
  'v 3 h d',
  'v l ^a',
  'v l ^x',
  '^a',
  '^x',
  'x . .',
  'v l y P P',
  'y l 3 p',
  'y l 3 P',
  '^c',
  '^x',
  'v l ^c',
  'v l ^x',
  'v l ^v',
]

// @requirement PRODUCT.md §4.3
it('never splits an emoji or puts the caret, a Visual end, a register or a copied range inside one', async () => {
  const failures: string[] = []
  for (const sequence of SEQUENCES) {
    for (const start of boundaries(TEXT).slice(0, -1)) {
      const problems = await run(start, sequence.trim().split(' '))
      if (problems.length > 0) failures.push(`${sequence} @${start}: ${problems.join('; ')}`)
    }
  }
  expect(failures).toEqual([])
})
