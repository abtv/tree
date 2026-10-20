import { describe, expect, it } from 'vitest'
import { backupFailure, backupSavedMessage } from './backup-protocol'

describe('backup worker protocol', () => {
  it('sends only a small saved notification without the document', () => {
    expect(backupSavedMessage()).toEqual({ type: 'saved' })
    expect(JSON.stringify(backupSavedMessage()).length).toBeLessThan(100)
  })
  it.each([
    ['NotAllowedError', 'permission'],
    ['SecurityError', 'permission'],
    ['NotFoundError', 'not-found'],
    ['QuotaExceededError', 'quota'],
    ['UnknownError', 'other'],
  ])('classifies %s as %s and retains the reason', (name, kind) => {
    expect(backupFailure(new DOMException('reason', name))).toEqual({ state: 'failed', kind, message: 'reason' })
  })
})
