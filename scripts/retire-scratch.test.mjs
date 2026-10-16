import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
  })
}

function createGitRepository() {
  const root = realpathSync(createRepository())
  git(root, 'init', '--quiet')
  writeFileSync(join(root, '.gitignore'), '.scratch/\noutput/\n')
  writeFileSync(join(root, 'source.txt'), 'committed\n')
  git(root, 'add', '.gitignore', 'source.txt')
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'initial')
  return root
}

function addWorktree(root, name = 'checkout') {
  const path = join(root, '.scratch', 'task', name)
  git(root, 'worktree', 'add', '--quiet', '--detach', path)
  return path
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

  it('retires one task without removing another task', () => {
    const root = createRepository()
    mkdirSync(join(root, '.scratch', 'completed-task'))
    writeFileSync(join(root, '.scratch', 'completed-task', 'evidence.txt'), 'synthetic evidence')
    expect(retireScratch({ rootDirectory: root, taskName: 'completed-task' })).toEqual({
      ok: true,
      relativePath: join('.scratch', 'completed-task'),
    })
    expect(existsSync(join(root, '.scratch', 'completed-task'))).toBe(false)
    expect(existsSync(join(root, '.scratch', 'task', 'nested', 'report.json'))).toBe(true)
  })

  it('refuses a missing directory and a regular file', () => {
    const root = createRepository()
    writeFileSync(join(root, '.scratch', 'task.lock'), '{}\n')
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'missing' })).toMatchObject({ ok: false })
    expect(resolveScratchRetirement({ rootDirectory: root, taskName: 'task.lock' })).toMatchObject({
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
  it('removes a clean worktree and its Git registration, including ignored build output', () => {
    const root = createGitRepository()
    const checkout = addWorktree(root)
    mkdirSync(join(checkout, 'output'))
    writeFileSync(join(checkout, 'output', 'build.txt'), 'generated\n')
    const other = join(root, '.scratch', 'other')
    git(root, 'worktree', 'add', '--quiet', '--detach', other)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' }).ok).toBe(true)

    expect(existsSync(join(root, '.scratch', 'task'))).toBe(false)
    expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(checkout)
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(other)
    expect(git(other, 'status', '--porcelain')).toBe('')
    expect(existsSync(join(root, 'source.txt'))).toBe(true)
  })

  it.each(['modified', 'staged', 'untracked'])('refuses a %s checkout before removing any task evidence', (kind) => {
    const root = createGitRepository()
    const clean = addWorktree(root, 'a-clean')
    const dirty = addWorktree(root, 'z-dirty')
    writeFileSync(join(dirty, kind === 'untracked' ? 'new.txt' : 'source.txt'), 'unfinished\n')
    if (kind === 'staged') git(dirty, 'add', 'source.txt')

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/uncommitted/i),
    })
    expect(existsSync(join(root, '.scratch', 'task', 'nested', 'report.json'))).toBe(true)
    expect(existsSync(clean)).toBe(true)
    expect(existsSync(dirty)).toBe(true)
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(clean)
  })

  it('refuses a locked worktree', () => {
    const root = createGitRepository()
    const checkout = addWorktree(root)
    git(root, 'worktree', 'lock', '--reason', 'unfinished', checkout)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
    expect(existsSync(checkout)).toBe(true)
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain('locked unfinished')
  })

  it('does not follow a symlink to an outside worktree', () => {
    const root = createGitRepository()
    const outside = join(root, '.scratch', 'outside')
    git(root, 'worktree', 'add', '--quiet', '--detach', outside)
    symlinkSync(outside, join(root, '.scratch', 'task', 'linked'))

    expect(retireScratch({ rootDirectory: root, taskName: 'task' }).ok).toBe(true)
    expect(existsSync(join(outside, 'source.txt'))).toBe(true)
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(outside)
  })

  it('refuses a worktree belonging to another repository', () => {
    const root = createGitRepository()
    const outside = createGitRepository()
    const checkout = join(root, '.scratch', 'task', 'foreign')
    git(outside, 'worktree', 'add', '--quiet', '--detach', checkout)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
    expect(existsSync(checkout)).toBe(true)
    expect(git(outside, 'worktree', 'list', '--porcelain')).toContain(checkout)
  })

  it.each([false, true])('checks an embedded standalone clone for uncommitted files (dirty=%s)', (dirty) => {
    const root = createGitRepository()
    const clone = join(root, '.scratch', 'task', 'clone')
    git(root, 'clone', '--quiet', '--no-hardlinks', root, clone)
    if (dirty) writeFileSync(join(clone, 'source.txt'), 'unfinished\n')

    expect(retireScratch({ rootDirectory: root, taskName: 'task' }).ok).toBe(!dirty)
    expect(existsSync(clone)).toBe(dirty)
  })

  it('refuses to delete an embedded clone that owns an outside worktree', () => {
    const root = createGitRepository()
    const clone = join(root, '.scratch', 'task', 'clone')
    git(root, 'clone', '--quiet', '--no-hardlinks', root, clone)
    const outside = join(root, '.scratch', 'outside')
    git(clone, 'worktree', 'add', '--quiet', '--detach', outside)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
    expect(existsSync(clone)).toBe(true)
    expect(git(outside, 'status', '--porcelain')).toBe('')
  })

  it('refuses to delete a bare clone that owns an outside worktree', () => {
    const root = createGitRepository()
    const bare = join(root, '.scratch', 'task', 'bare.git')
    git(root, 'clone', '--quiet', '--bare', '--no-hardlinks', root, bare)
    const outside = join(root, '.scratch', 'outside')
    git(bare, 'worktree', 'add', '--quiet', '--detach', outside)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
    expect(existsSync(bare)).toBe(true)
    expect(git(outside, 'status', '--porcelain')).toBe('')
  })

  it('removes a standalone bare clone without linked worktrees', () => {
    const root = createGitRepository()
    const bare = join(root, '.scratch', 'task', 'bare.git')
    git(root, 'clone', '--quiet', '--bare', '--no-hardlinks', root, bare)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' }).ok).toBe(true)
    expect(existsSync(bare)).toBe(false)
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('refuses malformed Git metadata instead of treating it as disposable files', () => {
    const root = createGitRepository()
    writeFileSync(join(root, '.scratch', 'task', '.git'), 'gitdir: missing\n')

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
    expect(existsSync(join(root, '.scratch', 'task', 'nested', 'report.json'))).toBe(true)
  })

  it('retires a task that is itself a linked worktree', () => {
    const root = createGitRepository()
    const checkout = join(root, '.scratch', 'whole-checkout')
    git(root, 'worktree', 'add', '--quiet', '--detach', checkout)

    expect(retireScratch({ rootDirectory: root, taskName: 'whole-checkout' }).ok).toBe(true)
    expect(existsSync(checkout)).toBe(false)
    expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(checkout)
  })

  it('unregisters only missing worktrees inside the selected task after an interrupted cleanup', () => {
    const root = createGitRepository()
    const missing = addWorktree(root)
    const unrelated = join(root, '.scratch', 'unrelated')
    git(root, 'worktree', 'add', '--quiet', '--detach', unrelated)
    rmSync(missing, { recursive: true })
    rmSync(unrelated, { recursive: true })

    expect(retireScratch({ rootDirectory: root, taskName: 'task' }).ok).toBe(true)
    const registered = git(root, 'worktree', 'list', '--porcelain')
    expect(registered).not.toContain(missing)
    expect(registered).toContain(unrelated)
  })

  it('refuses a registered worktree path replaced with a symlink', () => {
    const root = createGitRepository()
    const checkout = addWorktree(root)
    const outside = createOutsideDirectory()
    rmSync(checkout, { recursive: true })
    symlinkSync(outside, checkout)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' })).toMatchObject({ ok: false })
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(checkout)
  })

  it('does not invoke a configured filesystem monitor while inspecting a clone', () => {
    const root = createGitRepository()
    const checkout = addWorktree(root)
    const marker = join(root, 'monitor-ran')
    git(root, 'config', 'core.fsmonitor', `touch '${marker}'`)

    expect(retireScratch({ rootDirectory: root, taskName: 'task' }).ok).toBe(true)
    expect(existsSync(marker)).toBe(false)
    expect(existsSync(checkout)).toBe(false)
  })

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
