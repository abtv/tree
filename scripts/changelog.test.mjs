import { describe, expect, it } from 'vitest'
import { generateChangelog, parseConventionalCommit } from './changelog.mjs'

describe('parseConventionalCommit', () => {
  it('parses a typed commit with a scope', () => {
    expect(parseConventionalCommit('feat(domain): add node index')).toMatchObject({
      type: 'feat',
      scope: '(domain)',
      section: 'Added',
      subject: 'add node index',
    })
  })

  it('maps fix, perf, and refactor to their sections', () => {
    expect(parseConventionalCommit('fix: stop double save')?.section).toBe('Fixed')
    expect(parseConventionalCommit('perf: cache bytes')?.section).toBe('Performance')
    expect(parseConventionalCommit('refactor: split store')?.section).toBe('Changed')
  })

  it('rejects unrelated and unknown types', () => {
    expect(parseConventionalCommit('Fix a thing')).toBeUndefined()
    expect(parseConventionalCommit('unknown: something')).toBeUndefined()
  })
})

describe('generateChangelog', () => {
  it('groups conventional commits and ignores the rest', () => {
    const changelog = generateChangelog([
      { hash: 'abc1234', subject: 'feat: add a thing' },
      { hash: 'def5678', subject: 'fix: repair a thing' },
      { hash: 'aaa0000', subject: 'Legacy descriptive commit' },
    ])
    expect(changelog).toContain('### Added')
    expect(changelog).toContain('- add a thing (`abc1234`)')
    expect(changelog).toContain('### Fixed')
    expect(changelog).not.toContain('Legacy descriptive commit')
  })

  it('reports an empty history without crashing', () => {
    expect(generateChangelog([])).toContain('No conventional commits recorded yet.')
  })
})
