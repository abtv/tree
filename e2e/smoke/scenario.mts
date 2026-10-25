export const parentText = 'Smoke parent'
const today = new Date()
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
// Exceed the production word threshold after indenting, so persistence needs no idle wait or fake clock.
export const childText = `${date} Smoke child one two three four five six seven eight nine ten`

export interface SmokeDriver {
  waitFor: (script: string) => Promise<void>
  fill: (selector: string, text: string) => Promise<void>
  press: (selector: string, key: 'Enter' | 'Tab' | '0' | 'i' | 'Escape' | '/') => Promise<void>
  type: (selector: string, text: string) => Promise<void>
  enableVim: () => Promise<void>
  showView: (view: 'tree' | 'agenda') => Promise<void>
  reload: () => Promise<SmokeDriver>
}

const first = '.node-row .node-input'
const focused = '.node-input:focus'
const searchInput = 'input[aria-label="Search"]'
const rendered = `return Array.from(document.querySelectorAll('.node-row')).some(row =>
  row.getAttribute('data-depth') === '0' && row.querySelector('.node-input')?.textContent === ${JSON.stringify(parentText)}) &&
  Array.from(document.querySelectorAll('.node-row')).some(row =>
  row.getAttribute('data-depth') === '1' && row.querySelector('.node-input')?.textContent === ${JSON.stringify(childText)})`

async function search(driver: SmokeDriver, query: string) {
  await driver.press(':focus', '/')
  await driver.waitFor(`return document.activeElement?.matches(${JSON.stringify(searchInput)})`)
  await driver.fill(searchInput, query)
  await driver.waitFor(`return document.querySelector('.search-count')?.textContent === '1'`)
  await driver.press(searchInput, 'Enter')
  await driver.waitFor(`return !document.querySelector(${JSON.stringify(searchInput)}) &&
    document.querySelector('.search-count')?.textContent === '1 / 1' &&
    document.querySelector('.search-match-current')?.textContent === ${JSON.stringify(query)}`)
}

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

  // Start on the child and require search to move focus to another node in Tree.
  await search(restored, parentText)
  await restored.waitFor(
    `return document.activeElement?.closest('.node-row')?.querySelector('.node-input')?.textContent === ${JSON.stringify(parentText)}`,
  )
  await restored.press(':focus', 'Escape')

  await restored.showView('agenda')
  // Today's dated child must appear in the real projection, with its undated parent as context.
  await restored.waitFor(`return !!document.querySelector('.agenda-list') &&
    document.activeElement?.closest('.agenda-today')?.getAttribute('aria-selected') === 'true' &&
    Array.from(document.querySelectorAll('.agenda-role-match')).some(row => row.querySelector('.node-input, .agenda-text')?.textContent === ${JSON.stringify('Vim ' + childText)}) &&
    Array.from(document.querySelectorAll('.agenda-role-context')).some(row => row.querySelector('.agenda-text')?.textContent === ${JSON.stringify(parentText)})`)
  // Search from the day header, so a no-op confirmation cannot pass as a successful jump.
  await search(restored, 'Smoke child')
  await restored.waitFor(`return document.activeElement?.closest('.agenda-role-match')?.getAttribute('aria-selected') === 'true' &&
    document.activeElement?.textContent === ${JSON.stringify('Vim ' + childText)}`)
  await restored.press(':focus', 'Escape')
  await restored.showView('tree')
  await restored.waitFor(`return !document.querySelector('.agenda-list') &&
    document.activeElement?.closest('.node-row')?.querySelector('.node-input')?.textContent === ${JSON.stringify(parentText)}`)
  await restored.waitFor(`return !document.querySelector('.save-error, .error-boundary')`)
}
