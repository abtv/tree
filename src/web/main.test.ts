// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactElement } from 'react'
import type { App } from '../renderer/App'

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  connect: vi.fn(),
  initialize: vi.fn(async () => undefined),
  reportError: vi.fn(),
  render: vi.fn(),
  createRoot: vi.fn(),
  close: vi.fn(),
  about: vi.fn(),
  installAbout: vi.fn(),
  updates: vi.fn(),
  menu: vi.fn(),
  cache: vi.fn(),
  decode: vi.fn(),
  persistent: vi.fn(async () => 'persistent'),
  protectionText: vi.fn(() => 'Protected storage' as string | undefined),
  getVim: vi.fn(async () => false),
  setVim: vi.fn(async () => undefined),
  getAppearance: vi.fn(async () => 'system'),
  setAppearance: vi.fn(async () => undefined),
  appearanceChanged: vi.fn(),
  readAttachment: vi.fn(async () => new Uint8Array([1])),
  apple: vi.fn(() => false),
  drop: vi.fn(),
  store: vi.fn(),
}))
vi.mock('react-dom/client', () => ({ createRoot: mocks.createRoot }))
vi.mock('../renderer/App', () => ({ App: () => null }))
vi.mock('../renderer/ErrorBoundary', () => ({ ErrorBoundary: () => null }))
vi.mock('../application/editor-store', () => ({ EditorStore: mocks.store }))
vi.mock('./services', () => ({ installBrowserPrototype: mocks.install }))
vi.mock('./menu-focus', () => ({ installMenuFocus: () => ({ close: mocks.close }) }))
vi.mock('./data-menu', () => ({ installDataMenu: mocks.menu }))
vi.mock('./app-updates', () => ({ installAppUpdates: mocks.updates }))
vi.mock('./device', () => ({ isApplePlatform: mocks.apple }))
vi.mock('../renderer/about-dialog', () => ({ installAboutDialog: mocks.installAbout }))
vi.mock('../renderer/external-drop', () => ({ blockExternalDrops: mocks.drop }))
vi.mock('./storage-persistence', () => ({
  requestPersistentStorage: mocks.persistent,
  storageProtectionText: mocks.protectionText,
}))
vi.mock('../infrastructure/renderer/attachment-image-cache', () => ({
  createAttachmentImageCache: mocks.cache,
  decodeAttachmentImage: mocks.decode,
}))

const store = { initialize: mocks.initialize, reportError: mocks.reportError }
const data = {}
const isRunning = vi.fn(() => false)
const commands = {}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.initialize.mockResolvedValue(undefined)
  mocks.install.mockResolvedValue({ services: {}, connect: mocks.connect, data, vimAvailable: true })
  mocks.store.mockImplementation(function () {
    return store
  })
  mocks.createRoot.mockReturnValue({ render: mocks.render })
  mocks.installAbout.mockReturnValue({ show: mocks.about })
  mocks.menu.mockReturnValue({ commands, isRunning })
  mocks.apple.mockReturnValue(false)
  mocks.getVim.mockResolvedValue(false)
  mocks.protectionText.mockReturnValue('Protected storage')
  document.body.innerHTML = `
    <div id="root"></div><div id="tree-menu"></div><button id="tree-menu-button"></button>
    <span id="app-version">Tree 1.2.3</span><button id="app-about"></button>
    <button id="prototype-tree"></button><button id="prototype-agenda"></button>
    <button id="local-find"></button><button id="global-search"></button><button id="prototype-vim"></button>
    <button data-appearance="system"></button><button data-appearance="light"></button><button data-appearance="dark"></button>
    <span id="storage-status" hidden></span><div id="prototype-problem" hidden></div>`
  Object.assign(window, {
    treeApi: {
      getVimEnabled: mocks.getVim,
      setVimEnabled: mocks.setVim,
      getAppearance: mocks.getAppearance,
      setAppearance: mocks.setAppearance,
      onAppearanceChanged: mocks.appearanceChanged,
      readAttachment: mocks.readAttachment,
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(window, 'treeApi')
  Reflect.deleteProperty(window, 'prototypeStore')
  document.body.replaceChildren()
})

async function setup() {
  await import('./main')
  const tree = mocks.render.mock.lastCall![0] as ReactElement<{ children: ReactElement<ComponentProps<typeof App>> }>
  return tree.props.children.props
}

const button = (id: string) => document.getElementById(id) as HTMLButtonElement

describe('browser entry wiring', () => {
  it.each([false, true])('connects the initialized store and browser capabilities (Apple=%s)', async (apple) => {
    mocks.apple.mockReturnValue(apple)
    const props = await setup()

    expect(mocks.drop).toHaveBeenCalledExactlyOnceWith(window)
    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(store)
    expect(mocks.initialize).toHaveBeenCalledOnce()
    expect(mocks.store).toHaveBeenCalledWith({}, expect.any(Function), undefined, {
      idleMilliseconds: 300,
      cleanupRetryMilliseconds: 300,
    })
    const nextId = mocks.store.mock.lastCall![1] as () => string
    const firstId = nextId()
    expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(nextId()).not.toBe(firstId)
    expect(mocks.createRoot).toHaveBeenCalledExactlyOnceWith(document.getElementById('root'))
    expect(props).toMatchObject({
      store,
      menuCommands: commands,
      initialVimEnabled: false,
      vimAvailable: true,
      alwaysOnTopAvailable: false,
      shortcutPlatform: apple ? 'apple' : 'other',
      deferRichEditing: true,
    })
    expect(mocks.updates).toHaveBeenCalledWith(store, data, { close: mocks.close }, isRunning)
    expect(mocks.menu).toHaveBeenCalledExactlyOnceWith(store, document.getElementById('tree-menu'), data, {
      close: mocks.close,
    })
    expect(mocks.installAbout).toHaveBeenCalledExactlyOnceWith('Tree 1.2.3')
    expect(document.getElementById('app-version')).toBeNull()
    expect(mocks.cache).toHaveBeenCalledWith(expect.any(Function), mocks.decode, 128 * 1024 * 1024)
    const read = mocks.cache.mock.lastCall![0] as (id: string) => Promise<Uint8Array>
    await expect(read('image')).resolves.toEqual(new Uint8Array([1]))
    expect(mocks.readAttachment).toHaveBeenCalledExactlyOnceWith('image')
  })

  it('enables view commands only while registered and reports rejected actions', async () => {
    const props = await setup()
    const showTree = vi.fn()
    const failure = new Error('view failed')
    const showAgenda = vi.fn(async () => {
      throw failure
    })
    expect(button('prototype-tree').disabled).toBe(true)
    expect(button('prototype-agenda').disabled).toBe(true)

    const unregister = props.registerViewCommands!({ showTree, showAgenda })
    button('prototype-tree').click()
    button('prototype-agenda').click()
    await vi.waitFor(() => expect(mocks.reportError).toHaveBeenCalledExactlyOnceWith(failure))

    expect(showTree).toHaveBeenCalledOnce()
    expect(showAgenda).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledTimes(2)
    unregister()
    expect(button('prototype-tree').disabled).toBe(true)
    expect(button('prototype-agenda').disabled).toBe(true)
  })

  it('routes local and global search only while a search handler is registered', async () => {
    const props = await setup()
    const search = vi.fn()
    const unregister = props.registerSearchCommands!(search)

    button('local-find').click()
    button('global-search').click()
    unregister()
    button('local-find').click()
    button('global-search').click()
    await Promise.resolve()

    expect(search.mock.calls).toEqual([['find'], ['all']])
    expect(mocks.reportError).not.toHaveBeenCalled()
  })

  it.each([false, true])('toggles the stored Vim preference from %s', async (enabled) => {
    mocks.getVim.mockResolvedValue(enabled)
    const props = await setup()
    expect(props.initialVimEnabled).toBe(enabled)

    button('prototype-vim').click()
    await vi.waitFor(() => expect(mocks.setVim).toHaveBeenCalledExactlyOnceWith(!enabled))
  })

  it('shows About after closing the menu and keeps appearance choices synchronized', async () => {
    await setup()
    const choices = [...document.querySelectorAll<HTMLButtonElement>('[data-appearance]')]
    expect(choices.map((choice) => choice.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])

    button('app-about').click()
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.about).toHaveBeenCalledOnce()
    choices[2]!.click()
    expect(mocks.setAppearance).toHaveBeenCalledExactlyOnceWith('dark')
    const changed = mocks.appearanceChanged.mock.lastCall![0] as (value: string) => void
    changed('dark')

    expect(choices.map((choice) => choice.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
  })

  it.each([undefined, 'Protected storage'])('displays storage protection text %j', async (text) => {
    mocks.protectionText.mockReturnValue(text)
    await setup()
    const status = document.getElementById('storage-status')!

    expect(status.textContent).toBe(text ?? '')
    expect(status.hidden).toBe(text === undefined)
  })

  it('shows a startup failure without mounting the editor or wiring data operations', async () => {
    mocks.install.mockRejectedValueOnce(new Error('storage unavailable'))

    await import('./main')

    expect(document.getElementById('prototype-problem')!.textContent).toBe('storage unavailable')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(false)
    expect(mocks.render).not.toHaveBeenCalled()
    expect(mocks.menu).not.toHaveBeenCalled()
  })
})
