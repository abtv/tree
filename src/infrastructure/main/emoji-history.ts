import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizeEmojiHistory } from '../../domain/emoji-completion'

export function createEmojiHistoryStore(path: string) {
  let pending = Promise.resolve()
  return {
    async load(): Promise<string[]> {
      await pending.catch(() => undefined)
      try {
        return normalizeEmojiHistory(JSON.parse(await readFile(path, 'utf8')))
      } catch {
        return []
      }
    },
    save(value: readonly string[]): Promise<void> {
      const serialized = JSON.stringify(normalizeEmojiHistory(value))
      pending = pending
        .catch(() => undefined)
        .then(async () => {
          await mkdir(dirname(path), { recursive: true })
          await writeFile(`${path}.tmp`, serialized)
          await rename(`${path}.tmp`, path)
        })
      return pending
    },
  }
}
