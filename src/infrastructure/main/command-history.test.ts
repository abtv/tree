import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCommandHistoryStore } from './command-history'

describe('command history preference', () => {
  it('reads missing, malformed and unrecognized entries as empty history', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tree-command-history-')), 'history.json')
    const store = createCommandHistoryStore(path)
    expect(store.load()).toEqual([])
    for (const value of ['{broken', '{}', '["unknown", "quit", 1]']) {
      writeFileSync(path, value)
      expect(store.load()).toEqual([])
    }
  })

  it('writes normalized history once and restores it through a fresh store', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tree-command-history-')), 'data', 'history.json')
    createCommandHistoryStore(path).save(['set-theme-dark', 'set-theme-light', 'set-theme-dark', 'unknown'])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(['set-theme-dark', 'set-theme-light'])
    expect(createCommandHistoryStore(path).load()).toEqual(['set-theme-dark', 'set-theme-light'])
  })

  it('propagates write failure instead of reporting a successful persisted history', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tree-command-history-'))
    expect(() => createCommandHistoryStore(directory).save(['set-theme-dark'])).toThrow()
  })
})
