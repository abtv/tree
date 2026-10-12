import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { digest } from './initiative-runner-git.mjs'
import { boundedExecFileSync, withHostDeadline } from './initiative-runner-deadline.mjs'
import { observeProcess } from './initiative-runner-process.mjs'
import { RunRecords } from './initiative-runner-records.mjs'
import { proofArguments, withinProofWindow } from './runner-readiness-proof.mjs'

const manifest = {
  version: 1,
  fixtureDirectory: '.scratch/runner-readiness/rr4/live',
  startedAt: 1000,
  deadlineAt: 10000,
  approvalReference: 'Explicit synthetic proof window',
  seeds: { accepted: 'a'.repeat(40), repair: 'b'.repeat(40) },
}
const args = ['--authorized-proof', digest(manifest), 'accepted', 'finish']

describe('bounded Runner Readiness proof entry', () => {
  it('supports an identity-pinned initiative-specific synthetic namespace', () => {
    const selected = {
      ...manifest,
      fixtureDirectory: '.scratch/e2e-coverage-efficiency/preflight/lifecycle-one/fixtures/live',
    }
    const invocation = [
      '--authorized-fixture-proof',
      '.scratch/e2e-coverage-efficiency/preflight/lifecycle-one/proof.json',
      digest(selected),
      'accepted',
      'finish',
    ]
    expect(proofArguments(invocation, selected, 2000)).toMatchObject({ scenario: 'accepted', operation: 'finish' })
    for (const fixtureDirectory of [
      '.scratch/e2e-coverage-efficiency/live',
      '.scratch/e2e-coverage-efficiency/preflight/lifecycle-one/fixtures/../live',
      '.scratch/runner-readiness/rr4/live',
    ]) {
      const changed = { ...selected, fixtureDirectory }
      expect(() =>
        proofArguments([invocation[0], invocation[1], digest(changed), ...invocation.slice(3)], changed, 2000),
      ).toThrow()
    }
    expect(() =>
      proofArguments([invocation[0], '.scratch/other/preflight/id/proof.json', ...invocation.slice(2)], selected, 2000),
    ).toThrow()
  })
  it('bounds synchronous subprocesses while the event loop cannot deliver an abort timer', () => {
    const startedAt = Date.now()
    expect(() =>
      withHostDeadline(startedAt + 100, () =>
        boundedExecFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'pipe' }),
      ),
    ).toThrow()
    expect(Date.now() - startedAt).toBeLessThan(2000)
    expect(() => withHostDeadline(Date.now() - 1, () => {})).toThrow('exhausted')
    // Context must not leak into later invocations with a different allowance.
    expect(
      withHostDeadline(Date.now() + 5000, () =>
        boundedExecFileSync(process.execPath, ['-e', 'process.stdout.write("clean")'], { encoding: 'utf8' }),
      ),
    ).toBe('clean')
  })
  it('pins fixture scope, operations and the approved identity before any launch', () => {
    expect(proofArguments(args, manifest, 2000)).toEqual({
      scenario: 'accepted',
      operation: 'finish',
      source: undefined,
      deadlineAt: 10000,
    })
    for (const bad of [
      ['--authorized-plan', ...args.slice(1)],
      [args[0], 'stale', ...args.slice(2)],
      [args[0], args[1], '../../application', 'finish'],
      [args[0], args[1], 'accepted', 'arbitrary-command'],
      [...args, 'HEAD'],
      [...args, 'a'.repeat(40), 'extra'],
    ])
      expect(() => proofArguments(bad, manifest, 2000)).toThrow('identity-pinned')
    expect(() => proofArguments(args, manifest, 10000)).toThrow('exhausted')
    expect(() => proofArguments(args, manifest, 999)).toThrow('unavailable')
    for (const change of [
      { fixtureDirectory: '.' },
      { deadlineAt: 45 * 60000 + 1001 },
      { deadlineAt: 1000 },
      { approvalReference: '' },
      { seeds: { accepted: 'short', repair: 'b'.repeat(40) } },
    ]) {
      const altered = { ...manifest, ...change }
      expect(() => proofArguments([args[0], digest(altered), ...args.slice(2)], altered, 2000)).toThrow('Bounded RR-4')
    }
  })

  it('enforces the global window during an actual owned subprocess and confirms bounded cleanup', async () => {
    const directory = resolve('.scratch/runner-readiness/rr4/tests')
    mkdirSync(directory, { recursive: true })
    const root = mkdtempSync(join(directory, 'window-'))
    const records = new RunRecords({ root, initiative: 'proof', hostAuthorized: true })
    try {
      const result = await withinProofWindow(Date.now() + 100, (signal) =>
        observeProcess({
          records,
          signal,
          deadlineAt: Date.now() + 60000,
          argv: [process.execPath, '-e', 'setTimeout(() => {}, 60000)'],
          graceMs: 50,
        }),
      )
      expect(result.blocker.kind).toBe('interrupted')
      expect(result.cleanupUnconfirmed).not.toBe(true)
      expect(records.children.size).toBe(0)
      records.verifyArtifacts(result.artifacts)
      const aborted = new AbortController()
      aborted.abort()
      let launched = false
      await expect(
        withinProofWindow(
          Date.now() + 60000,
          () => {
            launched = true
          },
          aborted.signal,
        ),
      ).rejects.toThrow('before execution')
      expect(launched).toBe(false)
    } finally {
      records.release()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
