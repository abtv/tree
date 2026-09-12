import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Launched {
  app: ElectronApplication
  window: Page
}

export interface Seed {
  document: unknown
  location: unknown
}

const launchedApps: ElectronApplication[] = []
const observedSaveErrors = new Map<Page, { errors: string[]; timer: ReturnType<typeof setInterval> }>()
const closedApps = new WeakSet<ElectronApplication>()

export const test = base.extend<{ userDataDir: string }>({
  userDataDir: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'tree-perf-'))
    await use(directory)
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  },
})

test.afterEach(async () => {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
  const observations = [...observedSaveErrors.values()]
  observations.forEach(({ timer }) => clearInterval(timer))
  observedSaveErrors.clear()
  const errors = observations.flatMap(({ errors: values }) => values)
  if (errors.length > 0) {
    throw new Error(`Renderer reported save errors:\n${errors.join('\n')}`)
  }
})

export { expect }

export async function launchTree(userDataDir: string): Promise<Launched> {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
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
    await expect(window.getByRole('textbox').first()).toBeVisible()
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

async function closeApp(app: ElectronApplication): Promise<void> {
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

export function seedDocument(userDataDir: string, seed: Seed): void {
  const directory = join(userDataDir, 'data')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'document.json'), JSON.stringify({ version: 1, ...seed }))
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

export function round(value: number): number {
  return Math.round(value * 100) / 100
}
