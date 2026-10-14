import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveScratchRetirement, retireScratch } from './retire-scratch.mjs'

const temporaryDirectories = []

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-retire-scratch-'))
  temporaryDirectories.push(root)
  mkdirSync(join(root, '.scratch', 'task', 'nested'), { recursive: true })
  writeFileSync(join(root, '.scratch', 'task', 'nested', 'report.json'), '{}\n')
  return root
}

function createOutsideDirectory() {
  const outside = mkdtempSync(join(tmpdir(), 'tree-retire-scratch-outside-'))
  temporaryDirectories.push(outside)
  writeFileSync(join(outside, 'keep.txt'), 'keep\n')
  return outside
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('resolveScratchRetirement', () => {
  it('accepts a task directory directly under .scratch', () => {
    const root = createRepository()
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'task' })).toEqual({
      ok: true,
      relativePath: join('.scratch', 'task'),
    })
  })

  it('refuses a missing, empty, or non-string name', () => {
    const root = createRepository()
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: undefined })).toMatchObject({ ok: false })
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: '' })).toMatchObject({ ok: false })
  })

  it('refuses option-like names and names that are not one directory', () => {
    const root = createRepository()
    for (const taskName of ['--force', '.', '..', 'task/nested', '../task', 'task\\nested', join(root, '.scratch')]) {
      expect(resolveScratchRetirement({ rootDirectory: root, taskName })).toMatchObject({ ok: false })
    }
  })

  it.each(['autonomous-initiatives', 'autonomous-initiatives-pilot', 'e2e-coverage-efficiency', 'runner-readiness'])(
    'retires the owner-released namespace %s without removing another task',
    (taskName) => {
      const root = createRepository()
      mkdirSync(join(root, '.scratch', taskName))
      writeFileSync(join(root, '.scratch', taskName, 'evidence.txt'), 'synthetic evidence')
      expect(retireScratch({ rootDirectory: root, taskName })).toEqual({
        ok: true,
        relativePath: join('.scratch', taskName),
      })
      expect(existsSync(join(root, '.scratch', taskName))).toBe(false)
      expect(existsSync(join(root, '.scratch', 'task', 'nested', 'report.json'))).toBe(true)
    },
  )

  it('refuses a missing directory and a regular file', () => {
    const root = createRepository()
    writeFileSync(join(root, '.scratch', 'initiative-runner.lock'), '{}\n')
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'missing' })).toMatchObject({ ok: false })
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'initiative-runner.lock' })).toMatchObject({
      ok: false,
    })
  })

  it('refuses a symbolic link to a directory', () => {
    const root = createRepository()
    symlinkSync(createOutsideDirectory(), join(root, '.scratch', 'link'))
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'link' })).toMatchObject({ ok: false })
  })

  it('refuses a task whose real location escapes through a symlinked .scratch', () => {
    const root = mkdtempSync(join(tmpdir(), 'tree-retire-scratch-'))
    temporaryDirectories.push(root)
    const outside = createOutsideDirectory()
    mkdirSync(join(outside, 'task'))
    symlinkSync(outside, join(root, '.scratch'))
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
  })
})

describe('retireScratch', () => {
  it('removes the task directory and its contents', () => {
    const root = createRepository()

    const decision = retireScratch({ rootDirectory: root, taskName: 'task' })

    expect(decision).toEqual({ ok: true, relativePath: join('.scratch', 'task') })
    expect(existsSync(join(root, '.scratch', 'task'))).toBe(false)
    expect(existsSync(join(root, '.scratch'))).toBe(true)
  })

  it('removes a nested symlink without deleting its target', () => {
    const root = createRepository()
    const outside = createOutsideDirectory()
    symlinkSync(outside, join(root, '.scratch', 'task', 'outside-link'))

    retireScratch({ rootDirectory: root, taskName: 'task' })

    expect(existsSync(join(root, '.scratch', 'task'))).toBe(false)
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
  })

  it('does not remove anything for a refused name', () => {
    const calls = []
    const decision = retireScratch({
      rootDirectory: '/repository',
      taskName: 'missing',
      stat: () => {
        throw new Error('missing')
      },
      remove: (path) => calls.push(path),
    })

    expect(decision.ok).toBe(false)
    expect(calls).toEqual([])
  })
})
