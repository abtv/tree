// Test-only replacement for `electron.globalShortcut`.
//
// The application registers the global `Cmd+0` accelerator at startup, and an unavailable
// accelerator fails application startup. macOS accelerators are machine-global, so parallel E2E
// workers cannot each register the real shortcut. The e2e entry enables this stub for hidden
// parallel runs: every launch except the dedicated shortcut spec receives a `globalShortcut` whose
// registration succeeds locally without touching the operating system. `e2e/fixtures.ts` asserts the
// requested mode after launch, so a stub that stops applying fails loudly on the first launch.
//
// Like the hidden-window override, `globalShortcut` cannot be replaced by assignment, so the
// `Module._load` patch hands the application bundle a Proxy whose `globalShortcut` property is the
// stub. Other exports pass through to the real module.
const Module = require('node:module')

let enabled = false

const shortcutStub = {
  register: () => true,
  unregister: () => undefined,
  isRegistered: () => false,
}

function enableShortcutStub() {
  if (enabled) return
  enabled = true

  const originalLoad = Module._load
  Module._load = function (request) {
    const loaded = originalLoad.apply(this, arguments)
    if (request !== 'electron') return loaded
    return new Proxy(loaded, {
      get(target, property) {
        if (property === 'globalShortcut') return shortcutStub
        return Reflect.get(target, property, target)
      },
    })
  }
}

module.exports = { enableShortcutStub }
