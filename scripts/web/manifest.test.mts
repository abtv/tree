import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT_PUBLIC_FILES } from '../web-release/policy.mts'

const publicDir = resolve(import.meta.dirname, '../../src/web/public')

async function pngSize(name: string) {
  const bytes = await readFile(resolve(publicDir, name))

  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(bytes.toString('latin1', 12, 16)).toBe('IHDR')

  // Color type 6 is RGBA: the tile corners are transparent.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] }
}

// @requirement PRODUCT.md §24.1
describe('installable web app manifest', () => {
  it('names Tree at the origin root as a standalone app', async () => {
    const manifest = JSON.parse(await readFile(resolve(publicDir, 'manifest.webmanifest'), 'utf8'))

    expect(manifest).toMatchObject({
      id: './',
      name: 'Tree',
      short_name: 'Tree',
      start_url: './',
      scope: './',
      display: 'standalone',
      theme_color: '#fbf8f1',
      background_color: '#fbf8f1',
    })
    expect(manifest.icons).toEqual([
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ])

    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split('x').map(Number)

      await expect(pngSize(icon.src)).resolves.toEqual({ width, height, colorType: 6 })
    }
  })

  it('provides the Apple touch icon', async () => {
    await expect(pngSize('apple-touch-icon.png')).resolves.toEqual({ width: 180, height: 180, colorType: 6 })
  })

  it('keeps the public folder flat and equal to the publication allowlist', async () => {
    const entries = await readdir(publicDir, { withFileTypes: true })

    expect(entries.every((entry) => entry.isFile())).toBe(true)
    expect(entries.map((entry) => entry.name).sort()).toEqual([...ROOT_PUBLIC_FILES].sort())
  })
})
