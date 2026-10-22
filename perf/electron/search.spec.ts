import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'

test('keeps draft input and current results responsive across a wide Tree', async ({ userDataDir }) => {
  seedDocument(userDataDir, wideSeed(10_000))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.evaluate((input) => {
    const samples: number[] = []
    ;(window as unknown as { searchPaints: number[] }).searchPaints = samples
    input.addEventListener('input', (event) => {
      requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
    })
  })
  const start = performance.now()
  await prompt.pressSequentially('Child 9999')
  await expect(window.locator('.search-count')).toHaveText('1')
  const resultMs = performance.now() - start
  await window.waitForFunction(() => (window as unknown as { searchPaints: number[] }).searchPaints.length === 10)
  const samples = await window.evaluate(() =>
    (window as unknown as { searchPaints: number[] }).searchPaints.sort((a, b) => a - b),
  )
  const maximum = samples.at(-1)!
  const jumpStart = performance.now()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('textbox', { name: 'Node 10000', exact: true })).toBeFocused()
  const navigationMs = performance.now() - jumpStart
  await window.keyboard.press('i')
  const editStart = performance.now()
  await window.keyboard.type('x'.repeat(104))
  await expect(window.locator('.search-count')).toHaveText('1')
  const editMs = performance.now() - editStart
  recordPerfResult({
    kind: 'search',
    scenario: 'wide-10000',
    metrics: {
      resultMs: round(resultMs),
      inputPaintMaxMs: round(maximum),
      navigationMs: round(navigationMs),
      editMs: round(editMs),
    },
  })
  expect(maximum).toBeLessThan(100)
  expect(resultMs).toBeLessThan(1000)
  expect(navigationMs).toBeLessThan(1000)
  expect(editMs).toBeLessThan(1000)
})
