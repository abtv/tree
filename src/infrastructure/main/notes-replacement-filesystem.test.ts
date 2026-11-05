import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nodeReplacementFileSystem } from './notes-replacement'

const mocks = vi.hoisted(() => ({ open: vi.fn(), stat: vi.fn() }))
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  open: mocks.open,
  stat: mocks.stat,
}))

beforeEach(() => vi.resetAllMocks())

describe('replacement filesystem durability', () => {
  it.each(['write', 'file-sync', 'directory-sync'] as const)('closes the handle after a %s failure', async (phase) => {
    const failure = new Error('storage failure')
    const calls: string[] = []
    const file = {
      writeFile: vi.fn(async () => {
        calls.push('write')
        if (phase === 'write') throw failure
      }),
      sync: vi.fn(async () => {
        calls.push('sync')
        throw failure
      }),
      close: vi.fn(async () => {
        calls.push('close')
      }),
    }
    mocks.open.mockResolvedValue(file)

    const operation =
      phase === 'directory-sync'
        ? nodeReplacementFileSystem.syncDirectory('/notes')
        : nodeReplacementFileSystem.writeDurableFile('/notes/commit.json.tmp', 'journal')

    await expect(operation).rejects.toBe(failure)
    expect(calls).toEqual(
      phase === 'write' ? ['write', 'close'] : phase === 'file-sync' ? ['write', 'sync', 'close'] : ['sync', 'close'],
    )
    expect(file.close).toHaveBeenCalledOnce()
  })

  it('writes the journal completely before flushing and closing it', async () => {
    const calls: string[] = []
    const file = {
      writeFile: vi.fn<(contents: string, encoding?: string) => Promise<void>>(async () => {
        calls.push('write')
      }),
      sync: vi.fn(async () => {
        calls.push('sync')
      }),
      close: vi.fn(async () => {
        calls.push('close')
      }),
    }
    mocks.open.mockResolvedValue(file)

    await nodeReplacementFileSystem.writeDurableFile('/notes/commit.json.tmp', 'journal')

    expect(mocks.open).toHaveBeenCalledExactlyOnceWith('/notes/commit.json.tmp', 'w')
    expect(file.writeFile.mock.calls.map(([contents]) => contents)).toEqual(['journal'])
    expect(calls).toEqual(['write', 'sync', 'close'])
  })

  it('distinguishes a missing path from a path that cannot be inspected', async () => {
    const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    mocks.stat.mockRejectedValueOnce({ code: 'ENOENT' }).mockRejectedValueOnce(denied)

    await expect(nodeReplacementFileSystem.exists('/missing')).resolves.toBe(false)
    await expect(nodeReplacementFileSystem.exists('/denied')).rejects.toBe(denied)
  })
})
