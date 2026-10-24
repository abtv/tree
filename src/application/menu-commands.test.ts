import { describe, expect, it, vi } from 'vitest'
import { MenuCommands, dataMenuCommands } from './menu-commands'
import { normalizeCommandHistory } from './command-registry'

describe('menu commands', () => {
  // @requirement PRODUCT.md §20.2.28
  it('publishes stable snapshots, current availability and state-dependent backup actions', () => {
    const source = new MenuCommands()
    const listener = vi.fn()
    const stop = source.subscribe(listener)
    const entry = { name: 'back-up-to-folder' as const, enabled: true, run: vi.fn() }
    source.update([entry])
    const before = source.getSnapshot()
    source.update([entry])
    expect(source.getSnapshot()).toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)
    source.update([{ ...entry, enabled: false }])
    expect(source.getSnapshot()[0]?.enabled).toBe(false)
    source.update([{ ...entry, name: 'stop-backing-up' }])
    expect(source.getSnapshot().map((command) => command.name)).toEqual(['stop-backing-up'])
    stop()
    source.update([])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  // @requirement PRODUCT.md §20.2.28
  it('delegates each supported menu action and retains its history without restoring hidden actions', async () => {
    const source = new MenuCommands()
    for (const name of Object.keys(dataMenuCommands) as (keyof typeof dataMenuCommands)[]) {
      const run = vi.fn(async () => undefined)
      source.update([{ name, enabled: true, run }])
      await source.getSnapshot()[0]!.run({} as never, {} as never)
      expect(run).toHaveBeenCalledOnce()
      expect(normalizeCommandHistory([name, name])).toEqual([name])
    }
  })
})
