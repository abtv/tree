import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupStaleElectronProcesses } from './electron-process'

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

export interface PersistedWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Launched {
  app: ElectronApplication
  window: Page
}

const launchedApps: ElectronApplication[] = []
const observedSaveErrors = new Map<
  Page,
  { app: ElectronApplication; errors: string[]; timer: ReturnType<typeof setInterval>; collect: () => Promise<void> }
>()
const retainedSaveErrors: string[] = []
const closedApps = new WeakSet<ElectronApplication>()
const allowedRendererErrors: RegExp[] = []

export const test = base.extend<{ userDataDir: string }>({
  userDataDir: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'tree-e2e-'))
    await use(directory)
    await closeTrackedApps()
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  },
})

test.afterEach(async () => {
  const observations = [...observedSaveErrors.values()]
  await Promise.all(observations.map(({ collect }) => collect()))
  await closeTrackedApps()
  observations.forEach(({ timer }) => clearInterval(timer))
  observedSaveErrors.clear()
  const errors = [...retainedSaveErrors, ...observations.flatMap(({ errors: values }) => values)]
  retainedSaveErrors.length = 0
  const unexpectedErrors = errors.filter((message) => !allowedRendererErrors.some((pattern) => pattern.test(message)))
  allowedRendererErrors.length = 0
  if (unexpectedErrors.length > 0) {
    throw new Error(`Renderer reported save errors:\n${unexpectedErrors.join('\n')}`)
  }
})

export { expect }

export function allowRendererError(pattern: RegExp): void {
  allowedRendererErrors.push(pattern)
}

export async function clickApplicationMenuQuit(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const item = Menu.getApplicationMenu()?.items[0]?.submenu?.items[0]
    if (item?.click === undefined) throw new Error('The application menu quit item is unavailable.')
    item.click(item, BrowserWindow.getFocusedWindow() ?? undefined, {} as Electron.KeyboardEvent)
  })
}

export async function delaySaveIpc(app: ElectronApplication, milliseconds: number): Promise<void> {
  await app.evaluate(({}, delay) => {
    globalThis.__treeIpc.wrap('tree:save', () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay)))
  }, milliseconds)
}

async function closeTrackedApps(): Promise<void> {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  forgetObservations(app)
  const trackedIndex = launchedApps.indexOf(app)
  if (trackedIndex >= 0) launchedApps.splice(trackedIndex, 1)

  let electronProcess: ReturnType<ElectronApplication['process']>
  try {
    electronProcess = app.process()
  } catch {
    await app.close().catch(() => undefined)
    return
  }
  if (closedApps.has(app) || electronProcess.exitCode !== null || electronProcess.signalCode !== null) {
    await terminateProcess(electronProcess)
    return
  }
  const closePromise = app.close().catch(() => undefined)
  await Promise.race([closePromise, waitForProcessExit(electronProcess, 7_000)])
  await terminateProcess(electronProcess)
  await closePromise
}

async function terminateProcess(electronProcess: ReturnType<ElectronApplication['process']>): Promise<void> {
  await waitForProcessExit(electronProcess, 1_000)
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) electronProcess.kill('SIGTERM')
  await waitForProcessExit(electronProcess, 1_000)
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) electronProcess.kill('SIGKILL')
  await waitForProcessExit(electronProcess, 1_000)
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) {
    throw new Error('The Electron worker process did not exit during bounded teardown.')
  }
}

async function waitForProcessExit(
  electronProcess: ReturnType<ElectronApplication['process']>,
  timeoutMilliseconds: number,
): Promise<void> {
  if (electronProcess.exitCode !== null || electronProcess.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, timeoutMilliseconds)
    electronProcess.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

export async function launchTree(userDataDir: string, options: { expectReady?: boolean } = {}): Promise<Launched> {
  await closeTrackedApps()
  await cleanupStaleElectronProcesses('tree-e2e-')
  let app: ElectronApplication
  try {
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'e2e', 'electron-entry.cjs')],
      cwd: process.cwd(),
    })
  } catch (error) {
    await cleanupStaleElectronProcesses('tree-e2e-')
    throw new Error(`Electron failed to launch for E2E test: ${formatLaunchError(error)}`, { cause: error })
  }
  launchedApps.push(app)
  app.once('close', () => {
    closedApps.add(app)
    const trackedIndex = launchedApps.indexOf(app)
    if (trackedIndex >= 0) launchedApps.splice(trackedIndex, 1)
    forgetObservations(app)
  })
  try {
    const window = await app.firstWindow()
    await observeSaveErrors(window)
    if (options.expectReady !== false) await expect(window.locator('main.tree-app')).toBeVisible()
    return { app, window }
  } catch (error) {
    await closeApp(app)
    throw error
  }
}

function formatLaunchError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function observeSaveErrors(window: Page): Promise<void> {
  const errors: string[] = []
  await window.evaluate(() => {
    const browserWindow = globalThis as unknown as Window & {
      __treeObservedSaveErrors?: string[]
    }
    const observed = (browserWindow.__treeObservedSaveErrors ??= [])
    const scan = (): void => {
      document.querySelectorAll('.save-error').forEach((element) => {
        const message = element.textContent ?? ''
        if (!observed.includes(message)) observed.push(message)
      })
    }
    scan()
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  const timer = setInterval(() => {
    void window
      .locator('.save-error')
      .allTextContents()
      .then((messages) => {
        messages.forEach((message) => {
          if (!errors.includes(message)) errors.push(message)
        })
      })
      .catch(() => undefined)
  }, 25)
  const collect = async (): Promise<void> => {
    if (window.isClosed()) return
    await window
      .evaluate(() => {
        const browserWindow = globalThis as unknown as Window & { __treeObservedSaveErrors?: string[] }
        return browserWindow.__treeObservedSaveErrors ?? []
      })
      .then((messages) => messages.forEach((message) => !errors.includes(message) && errors.push(message)))
      .catch(() => undefined)
    await window
      .locator('.save-error')
      .allTextContents()
      .then((messages) => messages.forEach((message) => !errors.includes(message) && errors.push(message)))
      .catch(() => undefined)
  }
  const app = [...launchedApps].find((candidate) => candidate.windows().includes(window))
  if (app === undefined) throw new Error('The Electron app was not registered before error observation.')
  observedSaveErrors.set(window, { app, errors, timer, collect })
}

function forgetObservations(app: ElectronApplication): void {
  for (const [page, observation] of observedSaveErrors) {
    if (observation.app !== app) continue
    clearInterval(observation.timer)
    retainedSaveErrors.push(...observation.errors)
    observedSaveErrors.delete(page)
  }
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
    .evaluateAll((inputs) =>
      inputs.map((input) => (input instanceof HTMLTextAreaElement ? input.value : (input.textContent ?? ''))),
    )
}

export async function setCursor(input: ReturnType<Page['locator']>, position: number): Promise<void> {
  await input.evaluate((element, cursor) => {
    if (element instanceof HTMLTextAreaElement) {
      element.focus()
      element.setSelectionRange(cursor, cursor)
      return
    }
    const field = element as HTMLElement
    field.focus()
    const selection = field.ownerDocument.defaultView?.getSelection()
    if (!selection) return
    const range = field.ownerDocument.createRange()
    const walker = field.ownerDocument.createTreeWalker(field, NodeFilter.SHOW_TEXT)
    let remaining = cursor
    let current = walker.nextNode()
    while (current !== null) {
      const length = current.textContent?.length ?? 0
      const link = current.parentElement?.closest('a[contenteditable="false"]')
      if (link !== null && link !== undefined && remaining <= length) {
        const parent = link.parentNode ?? field
        const linkIndex = Array.from(parent.childNodes).indexOf(link)
        const beforeLink = remaining <= length / 2
        range.setStart(parent, beforeLink ? linkIndex : linkIndex + 1)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      if (remaining < length) {
        range.setStart(current, remaining)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      remaining -= length
      current = walker.nextNode()
    }
    range.selectNodeContents(field)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }, position)
}

export function documentPath(userDataDir: string): string {
  return join(userDataDir, 'data', 'document.json')
}

export function windowBoundsPath(userDataDir: string): string {
  return join(userDataDir, 'data', 'window-bounds.json')
}

export function readWindowBounds(userDataDir: string): PersistedWindowBounds {
  return JSON.parse(readFileSync(windowBoundsPath(userDataDir), 'utf8')) as PersistedWindowBounds
}

export function tryReadWindowBounds(userDataDir: string): PersistedWindowBounds | null {
  try {
    return readWindowBounds(userDataDir)
  } catch {
    return null
  }
}

export function seedDocument(userDataDir: string, seed: { document: unknown; location: unknown }): void {
  const directory = join(userDataDir, 'data')
  mkdirSync(directory, { recursive: true })
  writeFileSync(documentPath(userDataDir), JSON.stringify({ version: 1, ...seed }))
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
