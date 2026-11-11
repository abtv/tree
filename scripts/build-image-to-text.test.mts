import { beforeEach, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildImageToText } from './build-image-to-text.mts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), stat: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

it.each([
  ['linux', 'arm64'],
  ['linux', 'x64'],
  ['darwin', 'x64'],
] as const)('does not require Swift on %s/%s', async (platform, arch) => {
  await buildImageToText(platform, arch)
  expect(stat).not.toHaveBeenCalled()
  expect(execFileSync).not.toHaveBeenCalled()
})

it('builds a missing helper for the Electron minimum macOS target', async () => {
  vi.mocked(stat).mockRejectedValueOnce(new Error('missing'))

  await buildImageToText('darwin', 'arm64')

  expect(mkdir).toHaveBeenCalled()
  expect(execFileSync).toHaveBeenCalledWith(
    'xcrun',
    expect.arrayContaining([
      'swiftc',
      '-target',
      'arm64-apple-macos13.0',
      '-module-cache-path',
      resolve('.scratch/image-to-text/swift-cache'),
      '-framework',
      'Vision',
      '-framework',
      'ImageIO',
    ]),
    { stdio: 'inherit' },
  )
})

it('rebuilds after a build script change and reuses fresh output', async () => {
  vi.mocked(stat).mockResolvedValue({ mtimeMs: 2 } as Awaited<ReturnType<typeof stat>>)
  vi.mocked(stat).mockResolvedValueOnce({ mtimeMs: 1 } as Awaited<ReturnType<typeof stat>>)

  await buildImageToText('darwin', 'arm64')
  await buildImageToText('darwin', 'arm64')

  expect(execFileSync).toHaveBeenCalledOnce()
})
