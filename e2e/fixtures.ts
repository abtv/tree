import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

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

export const test = base.extend<{ userDataDir: string }>({
  userDataDir: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'tree-e2e-'))
    await use(directory)
    rmSync(directory, { recursive: true, force: true })
  },
})

test.afterEach(async () => {
  await Promise.all(launchedApps.splice(0).map((app) => app.close().catch(() => undefined)))
})

export { expect }

export async function launchTree(userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, '.'],
    cwd: process.cwd(),
  })
  launchedApps.push(app)
  const window = await app.firstWindow()
  await expect(window.locator('main.tree-app')).toBeVisible()
  return { app, window }
}

export function node(window: Page, index: number) {
  return window.getByRole('textbox', { name: `Node ${index}` })
}

export function parent(window: Page) {
  return window.getByRole('textbox', { name: 'Current parent' })
}

export function nodeCount(window: Page): Promise<number> {
  return window.locator('input[aria-label^="Node "]').count()
}

export function nodeTexts(window: Page): Promise<string[]> {
  return window.locator('input[aria-label^="Node "]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
}

export async function setCursor(input: ReturnType<Page['locator']>, position: number): Promise<void> {
  await input.evaluate((element, cursor) => {
    const field = element as HTMLInputElement
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
  await app.evaluate(async ({ clipboard, ClipboardItem }, base64) => {
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
    const item = new ClipboardItem({ 'public.png': new Blob([bytes], { type: 'image/png' }) })
    clipboard.clear()
    await clipboard.write([item])
  }, PNG_1X1_BASE64)
}

export async function writeClipboardImageAndText(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ clipboard, ClipboardItem }, base64) => {
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
    const item = new ClipboardItem({
      'public.png': new Blob([bytes], { type: 'image/png' }),
      'text/plain': 'text representation',
    })
    clipboard.clear()
    await clipboard.write([item])
  }, PNG_1X1_BASE64)
}

export async function writeClipboardImageSized(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }, size) => {
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
  }, { width, height })
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
