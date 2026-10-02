import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupStaleElectronProcesses } from '../e2e/electron-process'

export interface Launched {
  app: ElectronApplication
  window: Page
}

export interface Seed {
  document: unknown
  location: unknown
  /** Persisted view state; a seed with one is written as the version 3 schema. */
  view?: { expandedIds: string[]; selectedRowTop?: number }
}

const launchedApps: ElectronApplication[] = []
const observedSaveErrors = new Map<
  Page,
  { app: ElectronApplication; errors: string[]; timer: ReturnType<typeof setInterval>; collect: () => Promise<void> }
>()
const retainedSaveErrors: string[] = []
const closedApps = new WeakSet<ElectronApplication>()

export const test = base.extend<{ userDataDir: string }>({
  userDataDir: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'tree-perf-'))
    await use(directory)
    // Per-test teardown lives in this fixture rather than a module-level `test.afterEach`.
    // Playwright caches imported helper modules for the lifetime of the worker process, so a hook
    // declared here would attach only to the first test file's suite and silently stop running for
    // later files. Fixture teardown runs for every test in every file.
    try {
      const observations = [...observedSaveErrors.values()]
      await Promise.all(observations.map(({ collect }) => collect()))
      await closeTrackedApps()
      observations.forEach(({ timer }) => clearInterval(timer))
      observedSaveErrors.clear()
      const errors = [...retainedSaveErrors, ...observations.flatMap(({ errors: values }) => values)]
      retainedSaveErrors.length = 0
      if (errors.length > 0) {
        throw new Error(`Renderer reported save errors:\n${errors.join('\n')}`)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  },
})

export { expect }

async function closeTrackedApps(): Promise<void> {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
}

export async function launchTree(
  userDataDir: string,
  options: { memoryProbe?: boolean; initialMode?: 'normal' | 'insert'; vimEnabled?: boolean } = {},
): Promise<Launched> {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
  await cleanupStaleElectronProcesses('tree-perf-')
  // Most guarded interactions and their baselines are Vim editing sequences, so Vim editing is the
  // default; a standard-editing scenario passes `vimEnabled: false`.
  const vimEnabled = options.vimEnabled ?? true
  mkdirSync(join(userDataDir, 'data'), { recursive: true })
  writeFileSync(join(userDataDir, 'data', 'vim-enabled.json'), vimEnabled ? 'true' : 'false')
  let app: ElectronApplication
  try {
    app = await electron.launch({
      args: [
        `--user-data-dir=${userDataDir}`,
        ...(options.memoryProbe === true ? ['--enable-precise-memory-info', '--js-flags=--expose-gc'] : []),
        join(process.cwd(), 'e2e', 'electron-entry.cjs'),
      ],
      cwd: process.cwd(),
      // The performance suite measures a presented window (paint latency, typing cost, heap growth),
      // so it stays visible even though the e2e default is hidden. Baselines are recorded this way.
      env: { ...process.env, TREE_E2E_HIDDEN: '0' } as Record<string, string>,
    })
  } catch (error) {
    await cleanupStaleElectronProcesses('tree-perf-')
    throw new Error(`Electron failed to launch for performance test: ${formatLaunchError(error)}`, { cause: error })
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
    await observeSaveErrors(app, window)
    await expect(window.locator('main.tree-app')).toBeVisible()
    await expect(window.getByRole('textbox').first()).toBeVisible()
    if (vimEnabled && options.initialMode !== 'normal') {
      await window.keyboard.press('i')
      await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    }
    return { app, window }
  } catch (error) {
    await closeApp(app)
    throw error
  }
}

function formatLaunchError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function observeSaveErrors(app: ElectronApplication, window: Page): Promise<void> {
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
  observedSaveErrors.set(window, { app, errors, timer, collect })
}

async function closeApp(app: ElectronApplication): Promise<void> {
  forgetObservations(app)
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

function forgetObservations(app: ElectronApplication): void {
  for (const [page, observation] of observedSaveErrors) {
    if (observation.app !== app) continue
    clearInterval(observation.timer)
    retainedSaveErrors.push(...observation.errors)
    observedSaveErrors.delete(page)
  }
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

export function seedDocument(userDataDir: string, seed: Seed): void {
  const directory = join(userDataDir, 'data')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'document.json'), JSON.stringify({ version: seed.view === undefined ? 1 : 3, ...seed }))
}

interface BuiltNode {
  id: string
  text: string
  children: BuiltNode[]
}

export function wideSeed(count: number): Seed {
  const children: BuiltNode[] = Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    text: `Child ${index}`,
    children: [],
  }))
  return {
    document: { roots: [{ id: 'root', text: 'Root', children }] },
    location: { currentParentId: 'root', selectedNodeId: 'c0' },
  }
}

export function largeSeed(roots: number, perRoot: number): Seed {
  const rootNodes: BuiltNode[] = Array.from({ length: roots }, (_, rootIndex) => ({
    id: `r${rootIndex}`,
    text: `Root ${rootIndex}`,
    children: Array.from({ length: perRoot }, (_, childIndex) => ({
      id: `r${rootIndex}c${childIndex}`,
      text: `Node ${rootIndex}.${childIndex}`,
      children: [],
    })),
  }))
  return {
    document: { roots: rootNodes },
    location: { currentParentId: null, selectedNodeId: 'r0' },
  }
}

export function largeAttachmentSeed(roots: number, perRoot: number): Seed {
  const rootNodes = Array.from({ length: roots }, (_, rootIndex) => ({
    id: `r${rootIndex}`,
    text: `Root ${rootIndex}`,
    children: Array.from({ length: perRoot }, (_, childIndex) => ({
      id: `r${rootIndex}c${childIndex}`,
      text: `Node ${rootIndex}.${childIndex}`,
      ...(childIndex === 0 ? { attachment: { id: `child-image-${rootIndex}`, mimeType: 'image/png' } } : {}),
      children: [],
    })),
  }))
  return {
    document: { roots: rootNodes },
    location: { currentParentId: null, selectedNodeId: 'r0' },
  }
}

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export function seedAttachmentFiles(userDataDir: string, ids: string[]): void {
  const directory = join(userDataDir, 'data', 'attachments')
  mkdirSync(directory, { recursive: true })
  for (const id of ids) writeFileSync(join(directory, `${id}.png`), ONE_PIXEL_PNG)
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

export function round(value: number): number {
  return Math.round(value * 100) / 100
}

export async function collectRendererHeap(window: Page): Promise<number> {
  const usedHeap = await window.evaluate(() => {
    const gc = (globalThis as { gc?: () => void }).gc
    if (typeof gc !== 'function') return undefined
    gc()
    return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
  })
  if (usedHeap === undefined) {
    throw new Error(
      'Renderer heap measurement is unavailable; launch with --enable-precise-memory-info and --js-flags=--expose-gc.',
    )
  }
  return usedHeap
}
