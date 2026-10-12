import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atomicRecord, readRecord, RunRecords } from './initiative-runner-records.mjs'
import { digest } from './initiative-runner-git.mjs'

const roots = []
function fixture() {
  const directory = resolve('.scratch/runner-readiness/rr3/tests')
  mkdirSync(directory, { recursive: true })
  const root = mkdtempSync(join(directory, 'budget-'))
  roots.push(root)
  const open = () => new RunRecords({ root, initiative: 'example', hostAuthorized: true })
  return { root, open, records: open() }
}
const approval = { budgetMs: 1000, approvalReference: 'original owner approval' }
const owner = { commit: 'a'.repeat(40), inputIdentity: digest('reviewed inputs') }
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('preserved implementation and separate closure allowances', () => {
  it('excludes waiting across restart, resumes only the remainder and bounds repeated cycles', () => {
    const f = fixture()
    f.records.budget({ ...approval, now: 100 })
    f.records.save('history.json', { recoveryAttempts: 2, evidence: 'retained' })
    expect(f.records.suspendBudget(owner, 400).waiting.remainingMs).toBe(700)
    f.records.release()
    const records = f.open()
    expect(records.waitingBudget(owner, 100000).waiting.remainingMs).toBe(700)
    expect(() => records.budget({ ...approval, now: 100000 })).toThrow('suspended')
    const resumed = records.resumeBudget(owner, 100000)
    expect(resumed).toMatchObject({
      startedAt: 100,
      budgetMs: 1000,
      deadlineAt: 100700,
      suspendedMs: 99600,
      waiting: null,
    })
    const next = { ...owner, commit: 'b'.repeat(40) }
    expect(records.suspendBudget(next, 100200).waiting.remainingMs).toBe(500)
    expect(records.resumeBudget(next, 200000).deadlineAt).toBe(200500)
    expect(records.load('history.json')).toEqual({ recoveryAttempts: 2, evidence: 'retained' })
    expect(JSON.stringify(records.load('budget.json')).length).toBeLessThan(1000)
    expect(() => records.budget({ ...approval, now: 200500 })).toThrow('exhausted')
    expect(records.load('budget.json').budgetMs).toBe(1000)
    records.release()
  })

  it('never revives an allowance exhausted before waiting', () => {
    const { records } = fixture()
    records.budget({ ...approval, now: 100 })
    expect(records.suspendBudget(owner, 1200).waiting.remainingMs).toBe(0)
    expect(() => records.resumeBudget(owner, 9000)).toThrow('exhausted')
    expect(records.load('budget.json').waiting.remainingMs).toBe(0)
    records.release()
  })

  it('fails closed on clocks, checkpoint mismatch, unsupported legacy and contradictory ledgers', () => {
    const f = fixture()
    f.records.budget({ ...approval, now: 100 })
    f.records.suspendBudget(owner, 400)
    expect(() => f.records.waitingBudget(owner, 399)).toThrow('backwards')
    expect(() => f.records.resumeBudget({ ...owner, commit: 'c'.repeat(40) }, 500)).toThrow('contradictory')
    const saved = f.records.load('budget.json')
    f.records.release()
    atomicRecord(join(f.root, '.scratch/example/budget.json'), {
      ...saved,
      waiting: { ...saved.waiting, remainingMs: 1000 },
    })
    let records = f.open()
    expect(() => records.budget({ ...approval, now: 600, allowWaiting: true })).toThrow('Contradictory')
    records.release()
    atomicRecord(join(f.root, '.scratch/example/budget.json'), {
      initiative: 'example',
      ...approval,
      startedAt: 100,
      observedAt: 100,
      deadlineAt: 1100,
    })
    records = f.open()
    expect(() => records.suspendBudget(owner, 200)).toThrow('Legacy')
    expect(records.load('budget.json').deadlineAt).toBe(1100)
    records.release()
  })

  it('uses an independently approved closure deadline without consuming or renewing implementation', () => {
    const f = fixture()
    f.records.budget({ ...approval, now: 100 })
    f.records.suspendBudget(owner, 400)
    const closure = { closure: true, budgetMs: 200, approvalReference: 'separately approved closure' }
    expect(f.records.budget({ ...closure, now: 100000 }).deadlineAt).toBe(100200)
    const implementation = f.records.load('budget.json')
    f.records.release()
    const records = f.open()
    expect(records.budget({ ...closure, now: 100100 }).deadlineAt).toBe(100200)
    expect(() => records.budget({ ...closure, now: 100200 })).toThrow('exhausted')
    expect(() => records.budget({ ...closure, budgetMs: 300, now: 100200 })).toThrow('identity')
    expect(records.load('budget.json')).toEqual(implementation)
    expect(readRecord(records.file('closure-budget.json')).deadlineAt).toBe(100200)
    records.release()
  })

  it('closure for an owner-assisted initiative creates no implementation ledger', () => {
    const { records } = fixture()
    records.budget({ closure: true, budgetMs: 200, approvalReference: 'explicit closure', now: 100 })
    expect(existsSync(records.file('budget.json'))).toBe(false)
    records.release()
  })

  it('does not renew a missing closure ledger after a persisted closure launch', () => {
    const f = fixture()
    const closure = { closure: true, budgetMs: 200, approvalReference: 'explicit closure' }
    f.records.budget({ ...closure, now: 100 })
    f.records.save('authorization.json', { contract: { closure: { approved: true } } })
    f.records.release()
    rmSync(join(f.root, '.scratch/example/closure-budget.json'))
    const records = f.open()
    expect(() => records.budget({ ...closure, now: 10000 })).toThrow('Missing original closure')
    expect(existsSync(records.file('closure-budget.json'))).toBe(false)
    records.release()
  })

  it('retains the waiting allowance when the resumed deadline would overflow', () => {
    const { records } = fixture()
    records.budget({ ...approval, now: 100 })
    records.suspendBudget(owner, 400)
    expect(() => records.resumeBudget(owner, Number.MAX_SAFE_INTEGER - 100)).toThrow('overflow')
    expect(records.load('budget.json').waiting.remainingMs).toBe(700)
    expect(records.load('budget.json').deadlineAt).toBe(1100)
    records.release()
  })
})
