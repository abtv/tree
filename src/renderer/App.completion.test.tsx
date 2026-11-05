// @vitest-environment jsdom

import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createAppHarness, settleApp } from './test/app-harness'

type View = 'Tree' | 'Agenda'

async function fixture(view: View, vimEnabled: boolean, prefix = '2026-10-08 Plan ', suffix = '') {
  const f = await createAppHarness({
    vimEnabled,
    document: {
      roots: [
        { id: 'n', text: prefix + suffix, children: [] },
        { id: 'other', text: '2026-10-09 Other', children: [] },
      ],
    },
  })
  if (view === 'Agenda') {
    act(() => f.store.openAgenda())
    await settleApp()
    fireEvent.click(f.container.querySelector('.agenda-row[data-node-id="n"]')!)
    await settleApp()
  }
  const editor = () => screen.getByRole('textbox', { name: view === 'Tree' ? 'Node 1' : 'Agenda node n' })
  await f.focus(editor())
  if (vimEnabled) await f.press(editor(), 'i')
  await f.focus(editor(), prefix.length)

  const edit = async (expression: string) =>
    f.input(editor(), prefix + expression + suffix, prefix.length + expression.length)
  const press = async (key: string, modifiers: KeyboardEventInit = {}) => f.press(editor(), key, modifiers)
  const popup = () => screen.queryByRole('listbox', { name: 'Date suggestions' })
  const options = () => within(screen.getByRole('listbox', { name: 'Date suggestions' })).getAllByRole('option')
  const selected = () =>
    within(screen.getByRole('listbox', { name: 'Date suggestions' })).getByRole('option', { selected: true })
  const dates = () => options().map((option) => option.firstElementChild!.textContent)
  const assertText = (text: string) => {
    expect(f.node('n').text).toBe(text)
    const field = editor()
    expect(field instanceof HTMLTextAreaElement ? field.value : field.textContent).toBe(text)
    expect(field).toHaveFocus()
    expect(f.snapshot().document.roots.map((node) => node.id)).toEqual(['n', 'other'])
  }
  const acceptAndUndo = async (expression: string, date: string, key = 'Enter', acceptedSuffix = suffix) => {
    await press(key)

    assertText(prefix + date + acceptedSuffix)
    expect(f.selection(editor())).toEqual({ start: prefix.length + date.length, end: prefix.length + date.length })
    expect(popup()).toBeNull()
    if (vimEnabled) expect(screen.getByLabelText('Vim mode')).toHaveTextContent('INSERT')

    await press('z', { metaKey: true })

    assertText(prefix + expression + suffix)
    expect(popup()).toBeNull()
  }
  return { ...f, editor, edit, press, popup, options, selected, dates, assertText, acceptAndUndo }
}

describe.each([false, true])('App completion (Vim %s)', (vimEnabled) => {
  // @requirement PRODUCT.md §20.9
  it('accepts through the real plain-to-rich editor replacement and restores the literal expression', async () => {
    const f = await fixture('Tree', vimEnabled, 'Plan ')
    expect(f.editor()).toBeInstanceOf(HTMLTextAreaElement)

    await f.edit('next month')

    expect(f.dates()).toEqual(['2026-11-01', '2026-11-15', '2026-11-30'])

    await f.acceptAndUndo('next month', '2026-11-01', 'Tab')

    // Once decorated, NodeInput retains its rich editor even after Undo removes the ISO date.
    expect(f.editor()).toHaveAttribute('contenteditable', 'true')
  })

  describe.each(['Tree', 'Agenda'] as const)('%s rich editor', (view) => {
    // @requirement PRODUCT.md §20.9.1
    it('retains a chosen weekday through refinement and one Undo', async () => {
      const f = await fixture(view, vimEnabled)

      await f.edit('We')

      expect(f.popup()).toBeNull()

      await f.edit('Wedne')

      expect(f.dates()).toEqual(['2026-10-07', '2026-10-14'])
      expect(f.selected()).toHaveTextContent('2026-10-14')

      await f.press('ArrowUp')
      await f.edit('Wednesday')

      expect(f.selected()).toHaveTextContent('2026-10-07')

      await f.acceptAndUndo('Wednesday', '2026-10-07')
    })

    // @requirement PRODUCT.md §20.9.1
    // @requirement PRODUCT.md §20.9.3
    it.each(['next', 'last'] as const)(
      'disambiguates %s mon while preserving the chosen month date',
      async (qualifier) => {
        const f = await fixture(view, vimEnabled)
        const next = qualifier === 'next'
        const chosen = next ? '2026-11-15' : '2026-09-15'
        const weekday = next ? '2026-10-12' : '2026-09-28'

        await f.edit(`${qualifier} mon`)

        expect(f.dates()).toEqual(
          next
            ? ['2026-10-12', '2026-11-01', '2026-11-15', '2026-11-30']
            : ['2026-09-01', '2026-09-15', '2026-09-28', '2026-09-30'],
        )
        expect(f.options().filter((option) => option.textContent?.includes(`${qualifier} monday`))).toHaveLength(1)
        expect(f.options().filter((option) => option.textContent?.includes(`${qualifier} month`))).toHaveLength(3)
        expect(f.selected()).toHaveTextContent(next ? weekday : '2026-09-30')

        await f.press(next ? 'ArrowDown' : 'ArrowUp')
        await f.press(next ? 'ArrowDown' : 'ArrowUp')

        for (const [fragment, count] of [
          ['mont', 3],
          ['mon', 4],
          ['month', 3],
        ] as const) {
          await f.edit(`${qualifier} ${fragment}`)

          expect(f.options()).toHaveLength(count)
          expect(f.selected()).toHaveTextContent(chosen)
        }

        await f.acceptAndUndo(`${qualifier} month`, chosen)
        await f.edit(`${qualifier} mond`)

        expect(f.options()).toHaveLength(1)
        expect(f.selected()).toHaveTextContent(`${qualifier} monday`)

        await f.acceptAndUndo(`${qualifier} mond`, weekday)
      },
    )

    // @requirement PRODUCT.md §20.9.2
    it.each(['next', 'last'] as const)('accepts the closest %s month anchor with Tab', async (qualifier) => {
      const f = await fixture(view, vimEnabled)
      const expected =
        qualifier === 'next' ? ['2026-11-01', '2026-11-15', '2026-11-30'] : ['2026-09-01', '2026-09-15', '2026-09-30']
      const closest = qualifier === 'next' ? expected[0]! : expected[2]!

      await f.edit(`${qualifier} month`)

      expect(f.dates()).toEqual(expected)
      expect(f.selected()).toHaveTextContent(closest)
      expect(f.container.querySelector('.date-popup-footer')).toHaveTextContent(
        '↑ ↓ select · Enter/Tab accept · Esc dismiss',
      )

      await f.acceptAndUndo(`${qualifier} month`, closest, 'Tab')
    })

    // @requirement PRODUCT.md §20.9
    it('preserves a preposition and trailing text while refining a weekday', async () => {
      const f = await fixture(view, vimEnabled, '2026-10-08 Plan on ', ' at noon')

      await f.edit('fr')

      expect(f.popup()).toBeNull()

      await f.edit('fri')

      expect(f.options()).toHaveLength(2)

      await f.press('ArrowDown')
      await f.edit('friday')

      expect(f.selected()).toHaveTextContent('2026-10-16')

      await f.acceptAndUndo('friday', '2026-10-16')
    })

    // @requirement PRODUCT.md §20.9
    it('replaces the day after the caret while preserving its preposition and trailing text', async () => {
      const f = await fixture(view, vimEnabled, '2026-10-08 Plan by ', ' 15 at noon')

      await f.edit('Sept')

      expect(f.dates()).toEqual(['2026-09-15', '2027-09-15'])

      await f.press('ArrowDown')
      await f.edit('September')

      expect(f.selected()).toHaveTextContent('2026-09-15')

      await f.acceptAndUndo('September', '2026-09-15', 'Enter', ' at noon')
    })

    // @requirement PRODUCT.md §20.9
    it.each([
      {
        short: 'in se',
        prefix: 'in sep',
        refined: 'in sept',
        full: 'in september',
        dates: ['2026-09-01', '2027-09-01'],
        chosen: '2026-09-01',
      },
      {
        short: 'next fr',
        prefix: 'next fri',
        refined: 'next frid',
        full: 'next friday',
        dates: ['2026-10-16'],
        chosen: '2026-10-16',
      },
    ])('refines $full, restores it with Undo and dismisses the reopened popup', async (scenario) => {
      const f = await fixture(view, vimEnabled)

      await f.edit(scenario.short)

      expect(f.popup()).toBeNull()

      await f.edit(scenario.prefix)

      expect(f.dates()).toEqual(scenario.dates)
      expect(f.selected()).toHaveTextContent(scenario.dates.at(-1)!)

      if (scenario.dates.length > 1) await f.press('ArrowUp')
      for (const expression of [scenario.refined, scenario.full]) {
        await f.edit(expression)

        expect(f.selected()).toHaveTextContent(scenario.chosen)
      }

      await f.acceptAndUndo(scenario.full, scenario.chosen)
      await f.edit(scenario.full.slice(0, -1))

      expect(f.popup()).not.toBeNull()

      await f.press('Escape')

      expect(f.popup()).toBeNull()
      f.assertText(`2026-10-08 Plan ${scenario.full.slice(0, -1)}`)
      if (vimEnabled) expect(screen.getByLabelText('Vim mode')).toHaveTextContent('INSERT')
    })
  })
})
