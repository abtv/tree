import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface PersistedNode {
  id: string
  text: string
  attachment?: { id: string; mimeType: string }
  children: PersistedNode[]
}

export interface PersistedState {
  version: number
  document: { roots: PersistedNode[] }
  location: { currentParentId: string | null; selectedNodeId: string }
}

export interface Launched {
  app: ElectronApplication
  window: Page
}

const launchedApps: ElectronApplication[] = []
const observedSaveErrors = new Map<Page, { errors: string[]; timer: ReturnType<typeof setInterval> }>()
const closedApps = new WeakSet<ElectronApplication>()

export const test = base.extend<{ userDataDir: string }>({
  userDataDir: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'tree-e2e-'))
    await use(directory)
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  },
})

test.afterEach(async () => {
  await closeTrackedApps()
  const observations = [...observedSaveErrors.values()]
  observations.forEach(({ timer }) => clearInterval(timer))
  observedSaveErrors.clear()
  const errors = observations.flatMap(({ errors: values }) => values)
  if (errors.length > 0) {
    throw new Error(`Renderer reported save errors:\n${errors.join('\n')}`)
  }
})

export { expect }

async function closeTrackedApps(): Promise<void> {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  const trackedIndex = launchedApps.indexOf(app)
  if (trackedIndex >= 0) launchedApps.splice(trackedIndex, 1)

  let electronProcess: ReturnType<ElectronApplication['process']>
  try {
    electronProcess = app.process()
  } catch {
    await app.close().catch(() => undefined)
    return
  }
  if (closedApps.has(app) || electronProcess.exitCode !== null || electronProcess.signalCode !== null) return
  const exited = new Promise<void>((resolve) => app.once('close', resolve))
  let timeout: ReturnType<typeof setTimeout> | undefined

  await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined)
  try {
    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5_000)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) {
    electronProcess.kill('SIGTERM')
  }
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) {
    electronProcess.kill('SIGKILL')
  }
  await app.close().catch(() => undefined)
}

export async function launchTree(userDataDir: string): Promise<Launched> {
  await closeTrackedApps()
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, '.'],
    cwd: process.cwd(),
  })
  launchedApps.push(app)
  app.once('close', () => closedApps.add(app))
  try {
    const window = await app.firstWindow()
    observeSaveErrors(window)
    await expect(window.locator('main.tree-app')).toBeVisible()
    return { app, window }
  } catch (error) {
    await closeApp(app)
    throw error
  }
}

function observeSaveErrors(window: Page): void {
  const errors: string[] = []
  const timer = setInterval(() => {
    void window
      .locator('.save-error[role="status"]')
      .allTextContents()
      .then((messages) => {
        messages.forEach((message) => {
          if (!errors.includes(message)) errors.push(message)
        })
      })
      .catch(() => undefined)
  }, 25)
  observedSaveErrors.set(window, { errors, timer })
}

export function node(window: Page, index: number) {
  return window.getByRole('textbox', { name: `Node ${index}` })
}

export function parent(window: Page) {
  return window.getByRole('textbox', { name: 'Current parent' })
}

export function nodeCount(window: Page): Promise<number> {
  return window.locator('[aria-label^="Node "]').count()
}

export function nodeTexts(window: Page): Promise<string[]> {
  return window
    .locator('[aria-label^="Node "]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLTextAreaElement).value))
}

export async function setCursor(input: ReturnType<Page['locator']>, position: number): Promise<void> {
  await input.evaluate((element, cursor) => {
    const field = element as HTMLTextAreaElement
    field.focus()
    field.setSelectionRange(cursor, cursor)
  }, position)
}

export function documentPath(userDataDir: string): string {
  return join(userDataDir, 'data', 'document.json')
}

export function readPersisted(userDataDir: string): PersistedState {
  return JSON.parse(readFileSync(documentPath(userDataDir), 'utf8')) as PersistedState
}

export function attachmentFiles(userDataDir: string): string[] {
  const directory = join(userDataDir, 'data', 'attachments')
  return existsSync(directory) ? readdirSync(directory) : []
}

export async function writeClipboardText(app: ElectronApplication, text: string): Promise<void> {
  await app.evaluate(async ({ clipboard }, value) => {
    clipboard.clear()
    await clipboard.writeText(value)
  }, text)
}

export async function writeClipboardImage(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const png = nativeImage.createFromBitmap(Buffer.from([40, 90, 200, 255]), { width: 1, height: 1 }).toPNG()
    const item = new ClipboardItem({ 'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })
    clipboard.clear()
    await clipboard.write([item])
  })
}

export async function writeClipboardImageAndText(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const png = nativeImage.createFromBitmap(Buffer.from([40, 90, 200, 255]), { width: 1, height: 1 }).toPNG()
    const item = new ClipboardItem({
      'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'text/plain': 'text representation',
    })
    clipboard.clear()
    await clipboard.write([item])
  })
}

export async function writeClipboardImageSized(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(
    async ({ clipboard, ClipboardItem, nativeImage }, size) => {
      const pixels = Buffer.alloc(size.width * size.height * 4)
      for (let offset = 0; offset < pixels.length; offset += 4) {
        pixels[offset] = 40
        pixels[offset + 1] = 90
        pixels[offset + 2] = 200
        pixels[offset + 3] = 255
      }
      const png = nativeImage.createFromBitmap(pixels, { width: size.width, height: size.height }).toPNG()
      const item = new ClipboardItem({ 'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })
      clipboard.clear()
      await clipboard.write([item])
    },
    { width, height },
  )
}

export async function firePaste(input: ReturnType<Page['locator']>): Promise<void> {
  await input.evaluate((element) => {
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }))
  })
}

export async function typeInto(input: ReturnType<Page['locator']>, text: string): Promise<void> {
  await input.focus()
  await input.pressSequentially(text)
}
