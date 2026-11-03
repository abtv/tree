import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from 'vitest'
import { installerDigest } from './release-artifact.mts'

test('installer verification rejects missing, empty, linked, malformed and changed artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tree-release-artifact-'))
  const file = join(directory, 'Tree.dmg')
  try {
    await expect(installerDigest(file)).rejects.toThrow()
    await writeFile(file, '')
    await expect(installerDigest(file)).rejects.toThrow('nonempty regular file')
    await writeFile(file, 'signed installer')
    const digest = await installerDigest(file)

    await expect(installerDigest(file, digest)).resolves.toBe(digest)
    await expect(installerDigest(file, '')).rejects.toThrow('Invalid expected')
    await expect(installerDigest(file, `${digest}\n`)).rejects.toThrow('Invalid expected')
    await symlink(file, join(directory, 'linked.dmg'))
    await expect(installerDigest(join(directory, 'linked.dmg'))).rejects.toThrow('regular file')
    await expect(installerDigest(directory)).rejects.toThrow('regular file')

    await writeFile(file, 'modified installer')
    await expect(installerDigest(file, digest)).rejects.toThrow('digest mismatch')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
