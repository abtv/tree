import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function createJsonPreferenceStore<T>(path: string, normalize: (value: unknown) => T) {
  let pending = Promise.resolve()
  return {
    async load(): Promise<T> {
      await pending.catch(() => undefined)
      try {
        return normalize(JSON.parse(await readFile(path, 'utf8')))
      } catch {
        return normalize(undefined)
      }
    },
    save(value: unknown): Promise<void> {
      const serialized = JSON.stringify(normalize(value))
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
