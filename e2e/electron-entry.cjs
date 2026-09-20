const { ipcMain } = require('electron')
const { join } = require('node:path')
const { enableHiddenWindows } = require('./hidden-windows.cjs')

const handlers = new Map()
const originalHandle = ipcMain.handle.bind(ipcMain)
const originalRemoveHandler = ipcMain.removeHandler.bind(ipcMain)

ipcMain.handle = (channel, listener) => {
  handlers.set(channel, listener)
  return originalHandle(channel, listener)
}

ipcMain.removeHandler = (channel) => {
  handlers.delete(channel)
  return originalRemoveHandler(channel)
}

globalThis.__treeIpc = {
  get(channel) {
    return handlers.get(channel)
  },
  wrap(channel, wrapper) {
    const original = handlers.get(channel)
    if (original === undefined) throw new Error(`IPC handler "${channel}" is not registered.`)
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (...args) => wrapper(original, ...args))
  },
}

// Hidden windows are opt-in at the entry level: the e2e fixtures always pass the selected
// mode explicitly, while the performance fixtures keep the application visible for
// presented-window measurements. `e2e/fixtures.ts` asserts the selected mode after launch.
if (process.env['TREE_E2E_HIDDEN'] === '1') enableHiddenWindows()

require(join(__dirname, '..', 'out', 'main', 'index.js'))
