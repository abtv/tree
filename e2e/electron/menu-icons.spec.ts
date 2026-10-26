// @editing-modes: independent
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onePixelPng } from '../../src/electron/main/png-test-utils'
import type { TreeApi } from '../../src/shared/ipc'
import { clickApplicationMenuItem, expect, launchTree, seedDocument, test } from './fixtures'

// @requirement PRODUCT.md §9.3
// @requirement PRODUCT.md §17
test('keeps native view commands outside a modal image preview and restores its editor focus', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'note',
          text: '2026-10-14 Preview',
          children: [],
          attachment: { id: 'menu-image', mimeType: 'image/png' },
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
  const attachments = join(userDataDir, 'data', 'attachments')

  mkdirSync(attachments, { recursive: true })
  writeFileSync(join(attachments, 'menu-image.png'), onePixelPng)
  const { app, window } = await launchTree(userDataDir)
  const delivered: string[] = []

  await window.exposeFunction('observeMenuCommand', (command: string) => delivered.push(command))
  await window.evaluate(() => {
    const rendererWindow = globalThis as unknown as {
      treeApi: TreeApi
      observeMenuCommand(command: string): Promise<void>
    }
    rendererWindow.treeApi.onViewMenuCommand!((command) => {
      void rendererWindow.observeMenuCommand(command)
    })
  })
  const editor = window.locator('.node-input').first()
  await editor.focus()

  await window.getByRole('button', { name: 'Open image preview' }).click()
  const preview = window.getByRole('dialog', { name: 'Image preview' })

  await expect(preview).toBeVisible()

  await clickApplicationMenuItem(app, 'View', 'Agenda')

  await expect.poll(() => delivered).toEqual(['agenda'])

  await window.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

  await expect(window.locator('.agenda-list')).toHaveCount(0)

  await clickApplicationMenuItem(app, 'View', 'Tree')

  await expect.poll(() => delivered).toEqual(['agenda', 'tree'])
  await expect(preview).toBeVisible()
  await expect(window.getByRole('button', { name: 'Close image preview' })).toBeFocused()

  await window.keyboard.press('Escape')

  await expect(preview).toHaveCount(0)
  await expect(editor).toBeFocused()
})

// @requirement PRODUCT.md §9.3
// @requirement PRODUCT.md §25.1
test('installs nonempty native symbols on labeled view and data menu items', async ({ userDataDir }) => {
  const { app } = await launchTree(userDataDir)
  const items = await app.evaluate(({ Menu, nativeImage }) => {
    const menu = Menu.getApplicationMenu()!
    return ['File', 'View'].flatMap((label) =>
      menu.items
        .find((item) => item.label === label)!
        .submenu!.items.filter((item) => item.type !== 'separator' && item.label !== 'Appearance')
        .map((item) => {
          const icon = typeof item.icon === 'string' ? nativeImage.createFromPath(item.icon) : item.icon
          return { label: item.label, empty: icon?.isEmpty(), size: icon?.getSize() }
        }),
    )
  })

  expect(items.map((item) => item.label)).toEqual(['Export Notes…', 'Import Notes…', 'Tree', 'Agenda'])
  for (const item of items) {
    expect(item.empty, item.label).toBe(false)
    expect(item.size!.width, item.label).toBeGreaterThan(0)
    expect(item.size!.height, item.label).toBeGreaterThan(0)
  }
})

// @requirement PRODUCT.md §1.4
test('renders browser menu icons, aligned labels, check marks and disabled actions in Electron', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'note', text: 'Menu appearance review', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
  const { app, window } = await launchTree(userDataDir)
  // Chrome tests exercise the live browser handlers. This isolated, script-free copy exercises
  // the exact production markup/styles in Electron without adding browser APIs to the desktop app.
  const withoutScripts = (html: string) =>
    window.evaluate((html) => {
      const parsed = new DOMParser().parseFromString(html, 'text/html')
      parsed.querySelectorAll('script').forEach((script) => script.remove())

      return `<!doctype html>${parsed.documentElement.outerHTML}`
    }, html)
  const malformedHtml = await withoutScripts('<scrip<script></script>t>window.probeRan = true</script>')
  const remainingScripts = await window.evaluate(
    (html) => new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script').length,
    malformedHtml,
  )

  expect(remainingScripts).toBe(0)

  const html = (await withoutScripts(readFileSync('src/web/index.html', 'utf8'))).replace(
    '</head>',
    `<style>${readFileSync('src/renderer/styles.css', 'utf8')}\n${readFileSync('src/web/styles.css', 'utf8')}</style></head>`,
  )
  const opened = app.waitForEvent('window')
  const id = await app.evaluate(async ({ BrowserWindow }, html) => {
    const probe = new BrowserWindow({
      show: false,
      width: 800,
      height: 650,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'menu-icons' },
    })
    await probe.loadURL(`data:text/html,${encodeURIComponent(html)}`)
    return probe.id
  }, html)
  const page = await opened
  try {
    await page.evaluate(() => {
      document.getElementById('prototype-save-status')!.textContent = 'Saved locally in this browser'
      ;(document.getElementById('data-export') as HTMLButtonElement).disabled = true
      document.getElementById('tree-menu')!.showPopover()
      document.getElementById('prototype-agenda')!.focus()
    })
    const menu = page.locator('#tree-menu')
    const showUpdate = (visible: boolean) =>
      page.evaluate((visible) => {
        const status = document.getElementById('offline-status')!
        status.textContent = 'Ready to work offline'
        status.hidden = !visible
        document.getElementById('app-update')!.hidden = !visible
        document.getElementById('tree-menu-button')!.classList.toggle('update-attention', visible)
      }, visible)
    for (const appearance of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: appearance })

      await expect(menu).toHaveScreenshot(`browser-menu-${appearance}.png`)
      // @requirement PRODUCT.md §24.7
      await showUpdate(true)
      const action = (await page.locator('#app-update').boundingBox())!
      const status = (await page.locator('#offline-status').boundingBox())!
      expect(action.y).toBeGreaterThanOrEqual(status.y + status.height)
      await expect(page).toHaveScreenshot(`browser-update-${appearance}.png`)
      await showUpdate(false)
    }

    await page.setViewportSize({ width: 390, height: 650 })
    const bounds = await menu.boundingBox()

    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    await expect(menu).toHaveScreenshot('browser-menu-narrow.png')
    await showUpdate(true)
    await expect(page).toHaveScreenshot('browser-update-narrow.png')
  } finally {
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), id)
  }
})
