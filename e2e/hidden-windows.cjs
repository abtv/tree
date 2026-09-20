// Test-only replacement for `electron.BrowserWindow` that forces `show: false`.
//
// The electron module exposes `BrowserWindow` through a non-configurable getter, so neither
// assignment nor `Object.defineProperty` can replace it. The e2e entry calls
// `enableHiddenWindows()` before loading the application bundle; the `Module._load` patch
// then hands the bundle a Proxy whose `BrowserWindow` property is the wrapper below.
//
// A function wrapper (rather than a `class extends BrowserWindow`) is required: a subclass
// instance is not returned by `BrowserWindow.getAllWindows()`, which the fixtures use to
// address the application window. Linking the wrapper's prototype to the real class keeps
// `fromWebContents`, `instanceof`, and the other statics working.
const electron = require('electron')
const Module = require('node:module')

let enabled = false
let electronProxy = null

function enableHiddenWindows() {
  if (enabled) return
  enabled = true

  const OriginalBrowserWindow = electron.BrowserWindow

  function HiddenBrowserWindow(options = {}) {
    return new OriginalBrowserWindow({ ...options, show: false })
  }
  Object.setPrototypeOf(HiddenBrowserWindow, OriginalBrowserWindow)
  HiddenBrowserWindow.prototype = OriginalBrowserWindow.prototype

  const originalLoad = Module._load
  Module._load = function (request) {
    const loaded = originalLoad.apply(this, arguments)
    if (request !== 'electron') return loaded
    if (electronProxy === null) {
      electronProxy = new Proxy(loaded, {
        get(target, property) {
          if (property === 'BrowserWindow') return HiddenBrowserWindow
          return Reflect.get(target, property, target)
        },
      })
    }
    return electronProxy
  }
}

module.exports = { enableHiddenWindows }
