import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizeRecentNodes } from '../../application/recent-nodes'

export function createRecentNodesStore(path: string) {
  let pending = Promise.resolve()
  return {
    async load(): Promise<string[]> {
      await pending.catch(() => undefined)
      try {
        return normalizeRecentNodes(JSON.parse(await readFile(path, 'utf8')))
      } catch {
        return []
      }
    },
    save(value: readonly string[]): Promise<void> {
      const serialized = JSON.stringify(normalizeRecentNodes(value))
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
