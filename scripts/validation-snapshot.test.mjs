import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { comparePaths, createValidationSnapshot } from './validation-snapshot.mjs'

const temporaryDirectories = []

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-validation-snapshot-'))
  temporaryDirectories.push(root)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root })
  write(root, '.gitignore', 'generated/\n')
  write(root, 'tracked.txt', 'one\n')
  write(root, 'rename.txt', 'rename\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })
  return root
}

function write(root, relativePath, content) {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('createValidationSnapshot', () => {
  it('is deterministic for an unchanged repository', () => {
    const root = createRepository()
    expect(createValidationSnapshot({ rootDirectory: root })).toEqual(createValidationSnapshot({ rootDirectory: root }))
  })

  it('tracks content, deletion, and rename changes without treating staging as an input change', () => {
    const root = createRepository()
    const clean = createValidationSnapshot({ rootDirectory: root }).digest
    write(root, 'tracked.txt', 'two\n')
    const unstaged = createValidationSnapshot({ rootDirectory: root }).digest
    execFileSync('git', ['add', 'tracked.txt'], { cwd: root })
    const staged = createValidationSnapshot({ rootDirectory: root }).digest
    expect(staged).toBe(unstaged)
    unlinkSync(join(root, 'tracked.txt'))
    const deleted = createValidationSnapshot({ rootDirectory: root }).digest
    renameSync(join(root, 'rename.txt'), join(root, 'renamed.txt'))
    const renamed = createValidationSnapshot({ rootDirectory: root }).digest
    expect(new Set([clean, unstaged, deleted, renamed])).toHaveLength(4)
  })

  it('covers untracked text, binary content, and unusual filenames in stable order', () => {
    const root = createRepository()
    write(root, 'z $ file.txt', 'text\n')
    write(root, 'a binary.bin', Buffer.from([0, 1, 2, 255]))
    const first = createValidationSnapshot({ rootDirectory: root })
    expect(first.untrackedFiles).toEqual(['a binary.bin', 'z $ file.txt'])
    write(root, 'a binary.bin', Buffer.from([0, 1, 3, 255]))
    expect(createValidationSnapshot({ rootDirectory: root }).digest).not.toBe(first.digest)
  })

  it('tracks executable-mode changes on untracked regular files', () => {
    const root = createRepository()
    write(root, 'untracked-tool', '#!/bin/sh\n')
    chmodSync(join(root, 'untracked-tool'), 0o644)
    const nonExecutable = createValidationSnapshot({ rootDirectory: root }).digest
    chmodSync(join(root, 'untracked-tool'), 0o755)
    const executable = createValidationSnapshot({ rootDirectory: root }).digest
    chmodSync(join(root, 'untracked-tool'), 0o644)
    expect(executable).not.toBe(nonExecutable)
    expect(createValidationSnapshot({ rootDirectory: root }).digest).toBe(nonExecutable)
  })

  it('ignores generated files excluded by gitignore', () => {
    const root = createRepository()
    const before = createValidationSnapshot({ rootDirectory: root })
    write(root, 'generated/output.js', 'first\n')
    const after = createValidationSnapshot({ rootDirectory: root })
    expect(after).toEqual(before)
  })

  it('excludes the temporary validation record to avoid a self-referential digest', () => {
    const root = createRepository()
    const before = createValidationSnapshot({ rootDirectory: root })
    write(root, 'WORKING_PLAN.md', `Snapshot: ${before.digest}\n`)
    expect(createValidationSnapshot({ rootDirectory: root })).toEqual(before)
  })

  it('hashes an untracked symlink target without reading outside the repository', () => {
    const root = createRepository()
    symlinkSync('/outside/repository/missing-secret', join(root, 'external-link'))
    const first = createValidationSnapshot({ rootDirectory: root })
    expect(first.untrackedFiles).toContain('external-link')
    unlinkSync(join(root, 'external-link'))
    symlinkSync('/outside/repository/different-secret', join(root, 'external-link'))
    expect(createValidationSnapshot({ rootDirectory: root }).digest).not.toBe(first.digest)
  })

  it('handles tracked diffs larger than the Node child-process default buffer', () => {
    const root = createRepository()
    write(root, 'large.txt', 'a'.repeat(2 * 1024 * 1024))
    execFileSync('git', ['add', 'large.txt'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'large fixture'], { cwd: root })
    write(root, 'large.txt', 'b'.repeat(2 * 1024 * 1024))
    expect(createValidationSnapshot({ rootDirectory: root }).digest).toMatch(/^sha256:/)
  })

  it('orders case variants and non-ASCII paths deterministically', () => {
    const root = createRepository()
    for (const file of ['é.md', 'a.md', 'B.md']) write(root, file, file)
    expect(createValidationSnapshot({ rootDirectory: root }).untrackedFiles).toEqual(['B.md', 'a.md', 'é.md'])
    expect(['é.md', 'a.md', 'B.md', 'b.md'].sort(comparePaths)).toEqual(['B.md', 'a.md', 'b.md', 'é.md'])
  })
})
