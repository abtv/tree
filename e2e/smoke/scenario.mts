export const parentText = 'Smoke parent'
// Exceed the production word threshold after indenting, so persistence needs no idle wait or fake clock.
export const childText = 'Smoke child one two three four five six seven eight nine ten'

export interface SmokeDriver {
  waitFor: (script: string) => Promise<void>
  fill: (selector: string, text: string) => Promise<void>
  press: (selector: string, key: 'Enter' | 'Tab' | '0' | 'i' | 'Escape') => Promise<void>
  type: (selector: string, text: string) => Promise<void>
  enableVim: () => Promise<void>
  reload: () => Promise<SmokeDriver>
}

const first = '.node-row .node-input'
const focused = '.node-input:focus'
const rendered = `return Array.from(document.querySelectorAll('.node-row')).some(row =>
  row.getAttribute('data-depth') === '0' && row.querySelector('.node-input')?.textContent === ${JSON.stringify(parentText)}) &&
  Array.from(document.querySelectorAll('.node-row')).some(row =>
  row.getAttribute('data-depth') === '1' && row.querySelector('.node-input')?.textContent === ${JSON.stringify(childText)})`

export async function happyPath(driver: SmokeDriver) {
  await driver.waitFor(`return !!document.querySelector(${JSON.stringify(first)})`)
  await driver.fill(first, parentText)
  await driver.press(focused, 'Enter')
  await driver.waitFor(`return document.querySelector(${JSON.stringify(focused)})?.textContent === ''`)
  await driver.press(focused, 'Tab')
  await driver.fill(focused, childText)
  await driver.waitFor(rendered)
  // Read through the real platform adapter. No seeded document, mocked save or store mutation.
  await driver.waitFor(`return window.treeApi.load().then(state => state.document.roots.some(root =>
    root.text === ${JSON.stringify(parentText)} && root.children.some(child => child.text === ${JSON.stringify(childText)})))`)
  const restored = await driver.reload()
  await restored.waitFor(rendered)
  await restored.enableVim()
  await restored.waitFor(`return document.querySelector('.vim-mode')?.textContent === 'NORMAL'`)
  await restored.waitFor(
    `return document.querySelector(${JSON.stringify(focused)})?.textContent === ${JSON.stringify(childText)}`,
  )
  await restored.press(focused, '0')
  await restored.press(focused, 'i')
  await restored.waitFor(`return document.querySelector('.vim-mode')?.textContent === 'INSERT'`)
  await restored.type(focused, 'Vim ')
  await restored.press(focused, 'Escape')
  await restored.waitFor(`return document.querySelector('.vim-mode')?.textContent === 'NORMAL' &&
    document.querySelector(${JSON.stringify(focused)})?.textContent === ${JSON.stringify('Vim ' + childText)}`)
  await restored.waitFor(`return !document.querySelector('.save-error, .error-boundary')`)
}
