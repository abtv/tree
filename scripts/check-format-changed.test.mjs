import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectChangedFiles, comparePaths, prettierArguments, runFormatCheck } from './check-format-changed.mjs'

const temporaryDirectories = []

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-format-changed-'))
  temporaryDirectories.push(root)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root })
  write(root, '.gitignore', 'ignored.txt\n')
  write(root, 'tracked.js', 'const value = 1\n')
  write(root, 'deleted.md', '# Delete me\n')
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

describe('collectChangedFiles', () => {
  it('returns an empty scope for a clean repository', () => {
    expect(collectChangedFiles({ rootDirectory: createRepository() })).toEqual([])
  })

  it('includes staged, unstaged, and non-ignored untracked files', () => {
    const root = createRepository()
    write(root, 'tracked.js', 'const value = 2\n')
    write(root, 'staged file.md', '# Staged\n')
    execFileSync('git', ['add', 'staged file.md'], { cwd: root })
    write(root, 'odd $ name.json', '{}\n')
    write(root, 'ignored.txt', 'ignored\n')

    expect(collectChangedFiles({ rootDirectory: root })).toEqual(['odd $ name.json', 'staged file.md', 'tracked.js'])
  })

  it('excludes deleted files', () => {
    const root = createRepository()
    unlinkSync(join(root, 'deleted.md'))
    expect(collectChangedFiles({ rootDirectory: root })).toEqual([])
  })

  it('deduplicates a file with staged and unstaged changes', () => {
    const root = createRepository()
    write(root, 'tracked.js', 'const value = 2\n')
    execFileSync('git', ['add', 'tracked.js'], { cwd: root })
    write(root, 'tracked.js', 'const value = 3\n')
    expect(collectChangedFiles({ rootDirectory: root })).toEqual(['tracked.js'])
  })

  it('passes leading-dash filenames after the option terminator', () => {
    expect(prettierArguments(['--write', '-odd.js'])).toEqual([
      '--check',
      '--ignore-unknown',
      '--',
      '--write',
      '-odd.js',
    ])
    let receivedArguments
    const status = runFormatCheck({
      rootDirectory: '/repository',
      files: ['--write'],
      runProcess: (_command, arguments_) => {
        receivedArguments = arguments_
        return { status: 0 }
      },
    })
    expect(status).toBe(0)
    expect(receivedArguments.slice(-2)).toEqual(['--', '--write'])
  })

  it('orders case variants and non-ASCII paths by locale-independent UTF-8 bytes', () => {
    expect(['é.md', 'a.md', 'B.md', 'b.md'].sort(comparePaths)).toEqual(['B.md', 'a.md', 'b.md', 'é.md'])
  })
})
