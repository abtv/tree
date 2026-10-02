import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkEditingModes, runChecks } from './check-e2e-editing-modes.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const spec = (path, category, body = '') => ({
  path,
  content: `${category === undefined ? '' : `// @editing-modes: ${category}\n`}import { test } from './fixtures'\n${body}`,
})

describe('editing-mode categories', () => {
  it('accepts every known category on its first line', () => {
    const files = [
      spec('e2e/a.spec.ts', 'both', "describeForEachEditingMode('a', () => {})\n"),
      spec('e2e/b.spec.ts', 'vim'),
      spec('e2e/c.spec.ts', 'independent'),
      spec('e2e/d.spec.ts', 'pending'),
      spec('e2e/vim-toggle.spec.ts', 'explicit'),
    ]
    expect(checkEditingModes({ files })).toEqual({ issues: [], specCount: 5 })
  })

  it('fails a spec with a missing, misplaced, or malformed category line', () => {
    const files = [
      spec('e2e/missing.spec.ts'),
      { path: 'e2e/second.spec.ts', content: "import { test } from './fixtures'\n// @editing-modes: vim\n" },
      { path: 'e2e/typo.spec.ts', content: '// @editing-mode: vim\n' },
      { path: 'e2e/trailing.spec.ts', content: '// @editing-modes: vim extra\n' },
    ]
    expect(checkEditingModes({ files }).issues).toEqual(
      files.map(({ path }) => `${path}: the first line must be "// @editing-modes: <category>"`),
    )
  })

  it('fails an unknown category', () => {
    expect(checkEditingModes({ files: [spec('e2e/a.spec.ts', 'both-modes')] }).issues).toEqual([
      'e2e/a.spec.ts: unknown editing-mode category "both-modes"',
    ])
  })

  it('requires the helper in a "both" spec and rejects it elsewhere', () => {
    expect(checkEditingModes({ files: [spec('e2e/a.spec.ts', 'both')] }).issues).toEqual([
      'e2e/a.spec.ts: a "both" spec must call describeForEachEditingMode',
    ])
    expect(
      checkEditingModes({
        files: [spec('e2e/a.spec.ts', 'independent', "describeForEachEditingMode('a', () => {})\n")],
      }).issues,
    ).toEqual(['e2e/a.spec.ts: only a "both" spec may call describeForEachEditingMode'])
  })

  it('does not accept a mention of the helper that is not a call', () => {
    expect(
      checkEditingModes({ files: [spec('e2e/a.spec.ts', 'both', '// describeForEachEditingMode is not called\n')] })
        .issues,
    ).toEqual(['e2e/a.spec.ts: a "both" spec must call describeForEachEditingMode'])
  })

  it('reserves "explicit" for the preference spec', () => {
    expect(checkEditingModes({ files: [spec('e2e/a.spec.ts', 'explicit')] }).issues).toEqual([
      'e2e/a.spec.ts: only e2e/vim-toggle.spec.ts may use the "explicit" category',
    ])
    expect(checkEditingModes({ files: [spec('e2e/vim-toggle.spec.ts', 'vim')] }).issues).toEqual([
      'e2e/vim-toggle.spec.ts: must use the "explicit" category',
    ])
  })
})

describe('repository discovery', () => {
  it('scans nested specs and skips helpers, diagnostics, and other extensions', () => {
    const root = mkdtempSync(join(tmpdir(), 'tree-editing-modes-'))
    roots.push(root)
    const write = (path, content) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    write('e2e/ok.spec.ts', '// @editing-modes: independent\n')
    write('e2e/nested/bad.spec.ts', 'export {}\n')
    write('e2e/_diagnostic.spec.ts', 'export {}\n')
    write('e2e/fixtures.ts', 'export {}\n')
    write('e2e/notes.spec.txt', 'export {}\n')
    expect(runChecks({ rootDirectory: root })).toEqual({
      issues: ['e2e/nested/bad.spec.ts: the first line must be "// @editing-modes: <category>"'],
      specCount: 2,
    })
  })
})
