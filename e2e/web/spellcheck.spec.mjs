// @editing-modes: independent
import { test, expect } from './fixtures.mjs'

// Test browsers do not draw spelling markers, so a screenshot cannot detect them; assert the attribute instead.
test('disables spellcheck on plain and rich node inputs', async ({ newContext, baseURL }) => {
  const context = await newContext({ viewport: { width: 1100, height: 760 }, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(baseURL)
  const welcome = page.locator('[data-node-id="welcome"] .node-input')
  await welcome.waitFor()
  await welcome.fill('dfjdf kjjj 2026-10-17')
  await expect(welcome).not.toHaveJSProperty('tagName', 'TEXTAREA')

  const values = await page
    .locator('.node-input')
    .evaluateAll((inputs) => inputs.map((input) => [input.tagName, input.getAttribute('spellcheck')]))
  expect(values.some(([tag]) => tag === 'TEXTAREA')).toBe(true)
  expect(values.filter(([, spellcheck]) => spellcheck !== 'false')).toEqual([])
})
