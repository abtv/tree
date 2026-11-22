import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createJsonPreferenceStore } from './json-preference'

it('retains the last preference across a failed write and loads the acknowledged retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tree-json-preference-'))
  const path = join(directory, 'data', 'preference.json')
  const normalize = (value: unknown) => value === true
  const store = createJsonPreferenceStore(path, normalize)

  try {
    await store.save(true)
    await mkdir(`${path}.tmp`)

    await expect(store.save(false)).rejects.toThrow()

    expect(await store.load()).toBe(true)

    await rm(`${path}.tmp`, { recursive: true })
    const retry = store.save(false)
    const reading = store.load()

    await expect(reading).resolves.toBe(false)
    await retry
    expect(await createJsonPreferenceStore(path, normalize).load()).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
