import { describe, expect, it, vi } from 'vitest'
import { MenuCommands, dataMenuCommands } from './menu-commands'
import { normalizeCommandHistory } from './command-registry'

describe('menu commands', () => {
  // @requirement PRODUCT.md §20.2.28
  it('replaces actions with equal descriptions and publishes later description changes', async () => {
    const source = new MenuCommands()
    const listener = vi.fn()
    source.subscribe(listener)
    const exportNotes = vi.fn()
    const backUp = vi.fn()
    source.update([{ name: 'export-notes', description: 'Save a backup', enabled: true, run: exportNotes }])
    const before = source.getSnapshot()

    source.update([{ name: 'back-up-to-folder', description: 'Save a backup', enabled: true, run: backUp }])
    await source.getSnapshot()[0]!.run({} as never, {} as never)

    expect(source.getSnapshot()[0]!.name).toBe('back-up-to-folder')
    expect(backUp).toHaveBeenCalledOnce()
    expect(exportNotes).not.toHaveBeenCalled()
    expect(before[0]!.name).toBe('export-notes')
    expect(listener).toHaveBeenCalledTimes(2)

    source.update([{ name: 'back-up-to-folder', description: 'Back up to Work Notes', enabled: true, run: backUp }])

    expect(source.getSnapshot()[0]!.description).toBe('Back up to Work Notes')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('publishes a changed action even when another action remains unchanged', () => {
    const source = new MenuCommands()
    const listener = vi.fn()
    source.subscribe(listener)
    const exportEntry = { name: 'export-notes' as const, enabled: true, run: vi.fn() }
    const importEntry = { name: 'import-notes' as const, enabled: true, run: vi.fn() }
    source.update([exportEntry, importEntry])

    source.update([exportEntry, { ...importEntry, enabled: false }])

    expect(source.getSnapshot().map(({ name, enabled }) => ({ name, enabled }))).toEqual([
      { name: 'export-notes', enabled: true },
      { name: 'import-notes', enabled: false },
    ])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('exposes data actions without aliases or active toggle marks', () => {
    const source = new MenuCommands()
    source.update([{ name: 'export-notes', enabled: true, run: vi.fn() }])

    const command = source.getSnapshot()[0]!

    expect(command.aliases).toEqual([])
    expect(Boolean(command.active({} as never))).toBe(false)
  })

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
