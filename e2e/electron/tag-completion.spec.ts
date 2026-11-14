// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
  unlockSystemClipboard,
  writeClipboardText,
} from './fixtures'

describeForEachEditingMode('Tags', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.13
  test('accepts from a bare hash while replacing the plain editor', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'n', text: '', children: [] },
          { id: 'catalog', text: '#existing', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'n' },
    })
    const { window } = await launchTree(userDataDir)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await input.focus()
    await window.keyboard.type('#')

    await expect(input).toHaveValue('#')

    await window.keyboard.press('Enter')
    await window.keyboard.type('!')

    await expect(input).toHaveText('#existing!')
    await expect(input).toBeFocused()
    await expect(window.getByRole('listbox', { name: 'Tag suggestions' })).toHaveCount(0)

    await window.keyboard.press('Meta+a')
    await window.keyboard.type('#today')

    await expect(window.getByRole('listbox')).toHaveCount(0)
    await expect(input.locator('.tag-text')).toHaveText('#today')

    await window.keyboard.press('Enter')

    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveText('#today')
    await expect(window.getByRole('textbox', { name: 'Node 2', exact: true })).toBeFocused()
  })

  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.13
    test(`lowercases native marker typing while preserving old and pasted names in ${view}`, async ({
      userDataDir,
    }, testInfo) => {
      const prefix = view === 'Tree' ? '' : '2026-10-08 '
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: prefix, children: [] },
            { id: 'old', text: '#OldName @OldPerson &OldMeeting', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { app, window } = await launchTree(userDataDir)
      await setAgendaToday(window)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input = window.getByRole('textbox', { name: view === 'Tree' ? 'Node 1' : 'Agenda node n', exact: true })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      await setCursor(input, prefix.length)
      if (view === 'Tree') {
        await window.keyboard.type('#')
        await window.keyboard.insertText('İ')

        await expect(input).toHaveText('#i\u0307')

        await window.keyboard.type('X')

        await expect(input).toHaveText('#i\u0307X')

        await window.keyboard.press('Meta+a')
      }
      await window.keyboard.type('#Work @')
      const composition = await window.context().newCDPSession(window)

      await composition.send('Input.imeSetComposition', { text: 'A', selectionStart: 1, selectionEnd: 1 })

      await expect(input).toHaveText(`${prefix}#work @A`)

      await composition.send('Input.insertText', { text: 'A' })

      await expect(input).toHaveText(`${prefix}#work @a`)

      await composition.detach()
      await window.keyboard.type('nna &Meeting OUTSIDE ')

      await expect(input).toHaveText(`${prefix}#work @anna &meeting OUTSIDE `)
      await expect(input).toBeFocused()

      await writeClipboardText(app, '@Pasted')
      await window.keyboard.press('Meta+v')

      await expect(input).toHaveText(`${prefix}#work @anna &meeting OUTSIDE @Pasted`)
      unlockSystemClipboard()

      const position = prefix.length + '#work @anna &meeting OUTSIDE @P'.length
      await setCursor(input, position)
      await window.keyboard.press('Shift+ArrowRight')
      await window.keyboard.type('W')
      await window.keyboard.type('X')

      await expect(input).toHaveText(`${prefix}#work @anna &meeting OUTSIDE @Pwxsted`)
      await expect(input).toBeFocused()
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`lowercase-${view}.png`)) })

      if (view === 'Tree')
        await expect(window.getByRole('textbox', { name: 'Node 2', exact: true })).toHaveText(
          '#OldName @OldPerson &OldMeeting',
        )

      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await setCursor(input, position)
        await window.keyboard.press('R')
        await window.keyboard.type('Z')
        await window.keyboard.press('Backspace')
        await window.keyboard.type('Y')
        await window.keyboard.press('Escape')

        await expect(input).toHaveText(`${prefix}#work @anna &meeting OUTSIDE @Pyxsted`)

        await window.keyboard.press('u')

        await expect(input).toHaveText(`${prefix}#work @anna &meeting OUTSIDE @Pwxsted`)

        if (view === 'Tree') {
          await setCursor(input, 1)
          await window.keyboard.press('R')
          await input.dispatchEvent('keydown', { key: 'İ' })

          await expect(input).toHaveText('#i\u0307ork @anna &meeting OUTSIDE @Pwxsted')

          await window.keyboard.press('Backspace')

          await expect(input).toHaveText('#work @anna &meeting OUTSIDE @Pwxsted')

          await input.dispatchEvent('keydown', { key: 'İ' })
          await window.keyboard.press('Escape')

          await expect(input).toHaveText('#i\u0307ork @anna &meeting OUTSIDE @Pwxsted')

          await window.keyboard.press('u')

          await expect(input).toHaveText('#work @anna &meeting OUTSIDE @Pwxsted')
        }
      }
    })

    // @requirement PRODUCT.md §20.13
    test(`highlights literal tags and completes from the whole document in ${view}`, async ({
      userDataDir,
    }, testInfo) => {
      const prefix = view === 'Tree' ? 'Plan ' : '2026-10-08 Plan '
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: prefix, children: [] },
            {
              id: 'hidden',
              text: 'Projects #Work #work',
              children: [{ id: 'child', text: '#rocket #road_map #週-2', children: [] }],
            },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window } = await launchTree(userDataDir)
      await setAgendaToday(window)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input = window.getByRole('textbox', { name: view === 'Tree' ? 'Node 1' : 'Agenda node n', exact: true })
      const text = () =>
        input.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : element.textContent))
      const popup = window.getByRole('listbox', { name: 'Tag suggestions' })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      await setCursor(input, prefix.length)
      await window.keyboard.type('#')

      await expect(popup.getByRole('option')).toHaveText(['#Work', '#road_map', '#rocket', '#work', '#週-2'])

      await window.keyboard.type('r')

      await expect(input).toBeFocused()
      await expect(input.locator('.tag-text')).toHaveText('#r')
      await expect(popup).toBeVisible()

      await window.keyboard.type('kt')

      await expect(popup.getByRole('option')).toHaveText(['#rocket'])

      await window.keyboard.press('Tab')

      await expect.poll(text).toBe(`${prefix}#rocket`)
      await expect(input).toBeFocused()
      await expect(popup).toHaveCount(0)

      await window.keyboard.press('Meta+z')

      await expect.poll(text).toBe(`${prefix}#rkt`)
      await expect(popup).toHaveCount(0)

      await setCursor(input, prefix.length + 4)
      await window.keyboard.press('Backspace')
      await window.keyboard.type('t')
      await popup.getByRole('option').click()
      await window.keyboard.type(' #W')

      await expect(popup.getByRole('option')).toHaveText(['#Work', '#work'])
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`tags-${view}-case.png`)) })

      await window.keyboard.press('Escape')
      await window.keyboard.type(' #New_2026-x ')

      await expect(popup).toHaveCount(0)
      await expect(input.locator('.tag-text')).toHaveText(['#rocket', '#w', '#new_2026-x'])

      await window.keyboard.type('#New')

      await expect(popup.getByRole('option')).toHaveText(['#new_2026-x'])

      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        await window.screenshot({ path: testInfo.outputPath(screenshotName(`tags-${view}-${appearance}.png`)) })
      }
      await window.keyboard.press('Enter')

      await expect.poll(text).toBe(`${prefix}#rocket #w #new_2026-x #new_2026-x`)
      await expect(input).toBeFocused()
      if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')

      await window.keyboard.type('!')

      await expect.poll(text).toBe(`${prefix}#rocket #w #new_2026-x #new_2026-x!`)

      // Accept from a bare hash, including when the replacement itself introduces decoration.
      if (view === 'Tree') {
        await window.keyboard.press('Meta+a')
        await window.keyboard.type('#')
        await window.keyboard.press('Tab')
        await window.keyboard.type('!')

        await expect.poll(text).toBe('#Work!')
        await expect(input).toBeFocused()

        if (mode === 'vim') {
          await window.keyboard.press('Escape')
          await window.keyboard.press('V')

          await expect(input.locator('.tag-text')).toHaveCSS(
            'color',
            await input.evaluate((element) => getComputedStyle(element).color),
          )
          await window.screenshot({ path: testInfo.outputPath('tags-whole-node-selected.png') })
        }
      }
    })
  }
})
