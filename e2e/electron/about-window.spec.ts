// @editing-modes: independent
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { loadConfigFromFile, RendererConfigFactory } from 'electron-vite'
import {
  test,
  expect,
  launchTree,
  clickApplicationMenuItem,
  closeMainWindow,
  seedDocument,
  setCursor,
} from './fixtures'

// @requirement PRODUCT.md §1.3
test('loads the About icon from the development renderer in both appearances', async ({ userDataDir }) => {
  const { app } = await launchTree(userDataDir)
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    resolve('config/build/electron.vite.config.ts'),
  )
  const renderer = await new RendererConfigFactory(
    loaded.config.renderer!,
    { configFile: false },
    { root: process.cwd() },
  ).build()
  const server = await createServer({
    ...renderer,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, hmr: false },
  })
  let id: number | undefined

  try {
    await server.listen()
    const url = new URL('about.html', server.resolvedUrls!.local[0]!).href
    const opened = app.waitForEvent('window')
    id = await app.evaluate(async ({ BrowserWindow }, url) => {
      const probe = new BrowserWindow({
        show: false,
        width: 340,
        height: 340,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: 'about-dev-assets',
        },
      })
      await probe.loadURL(url)
      return probe.id
    }, url)
    const page = await opened

    for (const appearance of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: appearance })
      await expect
        .poll(() => page.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
      await page.screenshot({ path: test.info().outputPath(`about-dev-${appearance}.png`) })
    }
  } finally {
    if (id !== undefined) await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), id)
    await server.close()
  }
})

// @requirement PRODUCT.md §1.3
// @requirement PRODUCT.md §20.5
for (const appearance of ['light', 'dark'] as const) {
  test(`About Tree is modal, uses the ${appearance} palette and closes with Escape`, async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'note', text: 'A synthetic note', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'note' },
    })
    const { app, window } = await launchTree(userDataDir, { appearance })
    if (process.env['TREE_E2E_VISIBLE'] !== '1') {
      await app.evaluate(({ app }) => {
        app.on('browser-window-created', (_event, child) => {
          // Keep auxiliary windows hidden too; their production show() runs after first paint.
          child.show = () => undefined
        })
      })
    }
    const editor = window.locator('.node-input').first()
    await editor.focus()
    await setCursor(editor, 3)
    const selectionBefore = await editor.evaluate((element) => {
      const selection = element.ownerDocument.getSelection()!
      return {
        anchor: selection.anchorOffset,
        focus: selection.focusOffset,
        active: document.activeElement === element,
      }
    })
    const opened = app.waitForEvent('window')

    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    const about = await opened
    await about.waitForLoadState('load')
    // Playwright otherwise applies its default light media independently of nativeTheme.
    await about.emulateMedia({ colorScheme: appearance })

    await expect(about.getByRole('heading', { name: 'Tree', exact: true })).toBeVisible()
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string
    await expect(about.locator('#about-version')).toHaveText(
      new RegExp(`^Version ${version.replaceAll('.', '\\.')} · [A-Z][a-z]{2} \\d{1,2}, \\d{4}$`),
    )
    await expect(about.getByText('© 2026 Andrei Butov', { exact: true })).toBeVisible()
    await expect(about.getByRole('link', { name: 'MIT License' })).toHaveAttribute(
      'href',
      'https://github.com/abtv/tree/blob/main/LICENSE',
    )
    await expect(about.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute(
      'href',
      'https://github.com/abtv/tree',
    )
    expect(
      await about.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    ).toBe(true)
    expect(await about.evaluate(() => 'treeApi' in window)).toBe(false)

    const state = await app.evaluate(({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'About Tree')!
      return {
        modal: child.isModal(),
        parent: child.getParentWindow()?.getTitle(),
        background: child.getBackgroundColor().toLowerCase(),
      }
    })
    expect(state).toEqual({ modal: true, parent: 'Tree', background: appearance === 'dark' ? '#3f3f3f' : '#fbf8f1' })
    await expect(about.locator('body')).toHaveCSS(
      'background-color',
      appearance === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)',
    )
    await about.screenshot({ path: test.info().outputPath(`about-${appearance}.png`) })

    await clickApplicationMenuItem(app, 'View', 'Agenda')
    await window.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await expect(window.locator('.agenda-list')).toHaveCount(0)

    const menuState = () =>
      app.evaluate(({ Menu }) => {
        const root = Menu.getApplicationMenu()!
        return ['Edit', 'Window'].map((label) => {
          const item = root.items
            .find((item) => item.label === label)!
            .submenu!.items.find((item) => item.type === 'checkbox')!
          return { label: item.label, checked: item.checked, enabled: item.enabled }
        })
      })
    const blockedCheckboxes = await menuState()
    expect(blockedCheckboxes.map((item) => item.enabled)).toEqual([false, false])
    await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')
    await clickApplicationMenuItem(app, 'Window', 'Always on Top')
    await clickApplicationMenuItem(app, 'Edit', 'Find…')
    await clickApplicationMenuItem(app, 'File', 'Export Notes…')
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    expect(await menuState()).toEqual(blockedCheckboxes)

    if (appearance === 'light') {
      await app.evaluate(({ shell }) => {
        const opened: string[] = []
        ;(globalThis as unknown as { __aboutLinks: string[] }).__aboutLinks = opened
        shell.openExternal = async (url) => {
          opened.push(url)
        }
      })
      await about.getByRole('link', { name: 'MIT License' }).click()
      await about.getByRole('link', { name: 'GitHub repository' }).click()
      await expect
        .poll(() => app.evaluate(() => (globalThis as unknown as { __aboutLinks: string[] }).__aboutLinks))
        .toEqual(['https://github.com/abtv/tree/blob/main/LICENSE', 'https://github.com/abtv/tree'])
      expect(about.url()).toBe('app://tree/about.html')
      expect(app.windows()).toHaveLength(2)
    }

    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    expect(app.windows()).toHaveLength(2)

    const opposite = appearance === 'light' ? 'dark' : 'light'
    await app.evaluate(({ nativeTheme }, value) => {
      nativeTheme.themeSource = value as 'light' | 'dark'
    }, opposite)
    await about.emulateMedia({ colorScheme: opposite })
    await expect(about.locator('body')).toHaveCSS(
      'background-color',
      opposite === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)',
    )
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((item) => item.getTitle() === 'About Tree')!
            .getBackgroundColor()
            .toLowerCase(),
        ),
      )
      .toBe(opposite === 'dark' ? '#3f3f3f' : '#fbf8f1')

    await about.keyboard.press('Escape').catch((error: unknown) => {
      // Closing on keydown can destroy the CDP target before Playwright sends keyup.
      if (!(error instanceof Error) || !error.message.includes('Target page, context or browser has been closed'))
        throw error
    })

    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((item) => item.getTitle())))
      .toEqual(['Tree'])

    expect(app.windows()).toHaveLength(1)
    expect((await menuState()).map((item) => item.enabled)).toEqual([true, true])
    await expect(editor).toHaveText('A synthetic note')
    expect(
      await editor.evaluate((element) => {
        const selection = element.ownerDocument.getSelection()!
        return {
          anchor: selection.anchorOffset,
          focus: selection.focusOffset,
          active: document.activeElement === element,
        }
      }),
    ).toEqual(selectionBefore)

    const reopened = app.waitForEvent('window')
    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    const next = await reopened
    await next.waitForLoadState('load')
    await next
      .getByRole('button', { name: 'Close', exact: true })
      .click()
      .catch((error: unknown) => {
        if (!(error instanceof Error) || !error.message.includes('Target page, context or browser has been closed'))
          throw error
      })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

    if (appearance === 'light') {
      const thirdOpened = app.waitForEvent('window')
      await clickApplicationMenuItem(app, 'Tree', 'About Tree')
      await (await thirdOpened).waitForLoadState('load')
      const exited = app.waitForEvent('close')

      await closeMainWindow(app, { allowModalChildren: true })
      await exited
    }
  })
}
