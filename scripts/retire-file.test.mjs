import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRetirement, retireFile } from './retire-file.mjs'

const temporaryDirectories = []

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-retire-file-'))
  temporaryDirectories.push(root)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root })
  writeFileSync(join(root, 'tracked.ts'), 'export const value = 1\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })
  return root
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('resolveRetirement', () => {
  it('accepts a tracked regular file', () => {
    const root = createRepository()
    expect(resolveRetirement({ rootDirectory: root, requestedPath: 'tracked.ts' })).toEqual({
      ok: true,
      relativePath: 'tracked.ts',
    })
  })

  it('refuses a missing, empty, or non-string path', () => {
    const root = createRepository()
    expect(resolveRetirement({ rootDirectory: root, requestedPath: undefined })).toMatchObject({ ok: false })
    expect(resolveRetirement({ rootDirectory: root, requestedPath: '' })).toMatchObject({ ok: false })
  })

  it('refuses option-like and absolute paths', () => {
    const root = createRepository()
    expect(resolveRetirement({ rootDirectory: root, requestedPath: '--force' })).toMatchObject({ ok: false })
    expect(resolveRetirement({ rootDirectory: root, requestedPath: join(root, 'tracked.ts') })).toMatchObject({
      ok: false,
    })
  })

  it('refuses the repository root and paths outside it', () => {
    const root = createRepository()
    expect(resolveRetirement({ rootDirectory: root, requestedPath: '.' })).toMatchObject({ ok: false })
    expect(resolveRetirement({ rootDirectory: root, requestedPath: '../outside.ts' })).toMatchObject({ ok: false })
  })

  it('refuses a directory', () => {
    const root = createRepository()
    mkdirSync(join(root, 'directory'))
    expect(resolveRetirement({ rootDirectory: root, requestedPath: 'directory' })).toMatchObject({ ok: false })
  })

  it('refuses a symbolic link', () => {
    const root = createRepository()
    symlinkSync('tracked.ts', join(root, 'link.ts'))
    expect(resolveRetirement({ rootDirectory: root, requestedPath: 'link.ts' })).toMatchObject({ ok: false })
  })

  it('refuses a path whose real location escapes through a directory symlink', () => {
    const root = createRepository()
    const outside = mkdtempSync(join(tmpdir(), 'tree-retire-outside-'))
    temporaryDirectories.push(outside)
    writeFileSync(join(outside, 'tracked.ts'), 'export const value = 3\n')
    symlinkSync(outside, join(root, 'escaped'))
    expect(resolveRetirement({ rootDirectory: root, requestedPath: 'escaped/tracked.ts' })).toMatchObject({
      ok: false,
    })
  })

  it('refuses a missing or untracked file', () => {
    const root = createRepository()
    writeFileSync(join(root, 'untracked.ts'), 'export const value = 2\n')
    expect(resolveRetirement({ rootDirectory: root, requestedPath: 'missing.ts' })).toMatchObject({ ok: false })
    expect(resolveRetirement({ rootDirectory: root, requestedPath: 'untracked.ts' })).toMatchObject({ ok: false })
  })
})

describe('retireFile', () => {
  it('stages the deletion and removes the file from the working tree', () => {
    const root = createRepository()

    const decision = retireFile({ rootDirectory: root, requestedPath: 'tracked.ts' })

    expect(decision).toEqual({ ok: true, relativePath: 'tracked.ts' })
    expect(existsSync(join(root, 'tracked.ts'))).toBe(false)
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe('D  tracked.ts\n')

    execFileSync('git', ['restore', '--staged', '--worktree', 'tracked.ts'], { cwd: root })
    expect(existsSync(join(root, 'tracked.ts'))).toBe(true)
  })

  it('refuses a file with local modifications and leaves it in place', () => {
    const root = createRepository()
    writeFileSync(join(root, 'tracked.ts'), 'export const value = 2\n')

    expect(() => retireFile({ rootDirectory: root, requestedPath: 'tracked.ts' })).toThrow()
    expect(existsSync(join(root, 'tracked.ts'))).toBe(true)
  })

  it('does not run git for a refused path', () => {
    const calls = []
    const decision = retireFile({
      rootDirectory: '/repository',
      requestedPath: 'missing.ts',
      runGit: (args) => calls.push(args),
      stat: () => {
        throw new Error('missing')
      },
    })

    expect(decision.ok).toBe(false)
    expect(calls).toEqual([])
  })
})
