import { describe, expect, it, vi } from 'vitest'
import { auditIdentity, requireAudit } from './dependency-audit.mts'

const sha = 'a'.repeat(40)
const head = 'b'.repeat(40)
const before = 'c'.repeat(40)
const push = { before, after: sha, ref: 'refs/heads/main' }
const pr = {
  action: 'synchronize',
  number: 7,
  pull_request: { head: { sha: head }, base: { sha: before }, updated_at: '2026-10-25T10:00:00Z' },
}
const identity = auditIdentity('push', sha, push)
const run = {
  id: 42,
  path: '.github/workflows/audit-dependencies.yml',
  event: 'push',
  head_sha: sha,
  repository: { full_name: 'abtv/tree' },
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-10-25T10:00:00Z',
}
const marker = { name: `${identity.marker}-1`, expired: false }

function fixture(options: { runs?: unknown[]; artifacts?: unknown[] } = {}) {
  const request = vi.fn(async (path: string): Promise<unknown> => {
    if (path.includes('/workflows/')) return { workflow_runs: options.runs ?? [run] }
    if (path.includes('/artifacts')) return { total_count: 1, artifacts: options.artifacts ?? [marker] }
    throw new Error(`Unexpected request: ${path}`)
  })
  let elapsed = 0
  const wait = vi.fn(async () => {
    elapsed += 10
  })
  const invoke = () =>
    requireAudit({
      repository: 'abtv/tree',
      identity,
      request,
      now: () => elapsed,
      wait,
      timeout: 20,
    })
  return { request, wait, invoke }
}

describe('shared dependency audit', () => {
  it('identifies exact push events and PR merge snapshots', () => {
    expect(auditIdentity('push', sha, push)).toEqual(identity)
    expect(auditIdentity('push', sha, { ...push, before: head }).marker).not.toBe(identity.marker)
    const pull = auditIdentity('pull_request', sha, pr)
    expect(pull.headSha).toBe(head)
    expect(pull.marker).not.toBe(auditIdentity('pull_request', head, pr).marker)
    expect(pull.marker).not.toBe(
      auditIdentity('pull_request', sha, {
        ...pr,
        pull_request: { ...pr.pull_request, base: { sha } },
      }).marker,
    )
    expect(pull.marker).not.toBe(
      auditIdentity('pull_request', sha, {
        ...pr,
        pull_request: { ...pr.pull_request, updated_at: '2026-10-26T10:00:00Z' },
      }).marker,
    )
  })

  it('rejects unsupported events and invalid identity fields', () => {
    expect(() => auditIdentity('workflow_dispatch', sha, {})).toThrow()
    expect(() => auditIdentity('push', head, push)).toThrow()
    expect(() => auditIdentity('pull_request', sha, {})).toThrow()
  })

  it('accepts only the matching workflow and current successful attempt', async () => {
    const f = fixture()
    await expect(f.invoke()).resolves.toBe(42)
    expect(f.request.mock.calls[0]![0]).toContain(`event=push&head_sha=${sha}`)
    expect(f.wait).not.toHaveBeenCalled()
  })

  it.each(['failure', 'cancelled', 'timed_out', 'skipped', 'neutral'])('rejects a %s audit', async (conclusion) => {
    await expect(fixture({ runs: [{ ...run, conclusion }] }).invoke()).rejects.toThrow('did not succeed')
  })

  it('does not reuse a successful old attempt during a rerun', async () => {
    const f = fixture({ runs: [{ ...run, run_attempt: 2, status: 'in_progress', conclusion: null }] })
    await expect(f.invoke()).rejects.toThrow('Timed out')
    expect(f.wait).toHaveBeenCalled()
    await expect(fixture({ runs: [{ ...run, run_attempt: 2 }] }).invoke()).rejects.toThrow('Timed out')
    await expect(
      fixture({
        runs: [{ ...run, run_attempt: 2 }],
        artifacts: [{ ...marker, name: `${identity.marker}-2` }],
      }).invoke(),
    ).resolves.toBe(42)
  })

  it('rejects the latest matching failed run instead of accepting an older success', async () => {
    const f = fixture({ runs: [run, { ...run, id: 43, created_at: '2026-10-25T11:00:00Z', conclusion: 'failure' }] })
    await expect(f.invoke()).rejects.toThrow('did not succeed')
  })

  it.each([
    { ...run, head_sha: head },
    { ...run, event: 'pull_request' },
    { ...run, path: '.github/workflows/publish-demo.yml' },
    { ...run, repository: { full_name: 'attacker/tree' } },
  ])('rejects unrelated run metadata', async (unrelated) => {
    await expect(fixture({ runs: [unrelated] }).invoke()).rejects.toThrow('Timed out')
  })

  it.each([
    { artifacts: [] },
    { artifacts: [{ ...marker, expired: true }] },
    { artifacts: [{ ...marker, name: 'other-event-1' }] },
  ])('does not accept missing, expired or mismatched evidence', async ({ artifacts }) => {
    await expect(fixture({ artifacts }).invoke()).rejects.toThrow('Timed out')
  })

  it('waits for the central run and then accepts success', async () => {
    const f = fixture()
    f.request.mockResolvedValueOnce({ workflow_runs: [] })
    await expect(f.invoke()).resolves.toBe(42)
    expect(f.wait).toHaveBeenCalledOnce()
  })

  it('fails closed on API errors and malformed responses', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new Error('HTTP 403'))
    await expect(f.invoke()).rejects.toThrow('HTTP 403')
    f.request.mockResolvedValueOnce({})
    await expect(f.invoke()).rejects.toThrow('Invalid workflow runs')
    const g = fixture()
    g.request.mockResolvedValueOnce({ workflow_runs: [run] }).mockResolvedValueOnce({ artifacts: [] })
    await expect(g.invoke()).rejects.toThrow('Invalid artifacts')
  })
})
