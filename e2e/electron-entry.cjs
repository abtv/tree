const { ipcMain } = require('electron')
const { join } = require('node:path')

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

require(join(__dirname, '..', 'out', 'main', 'index.js'))
