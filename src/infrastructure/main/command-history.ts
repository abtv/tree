import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { normalizeCommandHistory } from '../../application/command-registry'

export function createCommandHistoryStore(path: string): { load(): string[]; save(value: string[]): void } {
  return {
    load: () => {
      try {
        return normalizeCommandHistory(JSON.parse(readFileSync(path, 'utf8')))
      } catch {
        return []
      }
    },
    save: (value) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(normalizeCommandHistory(value)))
    },
  }
}
