import { expect as playwrightExpect, type Page } from '@playwright/test'
import { ESLint } from 'eslint'
import { expect, it } from 'vitest'
import { createPlatformExpect } from '../e2e/electron/platform-expect.ts'

it('rejects Linux snapshot assertions through helpers, including negated and configured expectations', () => {
  const linuxExpect = createPlatformExpect('linux')
  const snapshotFromHelper = () => linuxExpect('text').toMatchSnapshot('example.txt')
  // An inert receiver proves rejection happens before Playwright touches a page.
  const page = {} as Page

  expect(snapshotFromHelper).toThrow('Snapshot assertions belong to the macOS Electron suite')
  expect(() => linuxExpect('text').not.toMatchSnapshot('example.txt')).toThrow(
    'Snapshot assertions belong to the macOS Electron suite',
  )
  expect(() => linuxExpect.configure({ message: 'custom message' })(page).toHaveScreenshot('example.png')).toThrow(
    'Snapshot assertions belong to the macOS Electron suite',
  )
  expect(() => linuxExpect.soft(page).toHaveScreenshot('example.png')).toThrow(
    'Snapshot assertions belong to the macOS Electron suite',
  )
  linuxExpect(3).toBe(3)
})

it('preserves the original macOS assertion implementation', () => {
  expect(createPlatformExpect('darwin')).toBe(playwrightExpect)
})

const eslint = new ESLint()

it.each([
  "import { expect } from '@playwright/test'",
  "import { expect as check } from '@playwright/test'",
  "import * as playwright from '@playwright/test'",
  "export { expect } from '@playwright/test'",
  "export * from '@playwright/test'",
  "import { expect } from 'playwright/test'",
])('rejects bypassing the shared assertion owner: %s', async (source) => {
  const [result] = await eslint.lintText(source, { filePath: 'e2e/electron/example.ts' })

  expect(result!.messages.some(({ ruleId }) => ruleId === 'no-restricted-imports')).toBe(true)
})

it.each([
  ["import { expect } from './fixtures'", 'e2e/electron/example.ts'],
  ["import { expect } from './platform-expect'", 'e2e/electron/helper.ts'],
  ["import { test, type Page } from '@playwright/test'", 'e2e/electron/example.ts'],
  ["import { expect } from '@playwright/test'", 'e2e/electron/platform-expect.ts'],
])('allows assertion ownership and other Playwright imports: %s', async (source, filePath) => {
  const [result] = await eslint.lintText(source, { filePath })

  expect(result!.messages.some(({ ruleId }) => ruleId === 'no-restricted-imports')).toBe(false)
})
