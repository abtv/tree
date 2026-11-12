import { beforeEach, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { buildSummarize } from './build-summarize.mts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), stat: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

it.each([
  ['linux', 'arm64'],
  ['darwin', 'x64'],
] as const)('skips native compilation on %s/%s', async (platform, arch) => {
  await buildSummarize(platform, arch)

  expect(stat).not.toHaveBeenCalled()
  expect(execFileSync).not.toHaveBeenCalled()
})

it('compiles the helper with an availability guard while preserving the application minimum', async () => {
  vi.mocked(stat).mockRejectedValueOnce(new Error('Missing'))

  await buildSummarize('darwin', 'arm64')

  expect(mkdir).toHaveBeenCalled()
  expect(execFileSync).toHaveBeenCalledWith(
    'xcrun',
    expect.arrayContaining(['swiftc', '-parse-as-library', '-target', 'arm64-apple-macos13.0']),
    { stdio: 'inherit' },
  )
})

it('reuses fresh output and rebuilds when the helper or build script changes', async () => {
  vi.mocked(stat).mockResolvedValue({ mtimeMs: 2 } as Awaited<ReturnType<typeof stat>>)
  await buildSummarize('darwin', 'arm64')
  expect(execFileSync).not.toHaveBeenCalled()

  vi.mocked(stat).mockResolvedValueOnce({ mtimeMs: 1 } as Awaited<ReturnType<typeof stat>>)
  await buildSummarize('darwin', 'arm64')

  expect(execFileSync).toHaveBeenCalledOnce()
})
