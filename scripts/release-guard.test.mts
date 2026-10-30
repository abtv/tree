import { test } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const names = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
const credentials = Object.fromEntries(names.map((name) => [name, 'test-placeholder']))

test('release guard rejects every missing credential without exposing values', () => {
  for (const name of names) {
    const env = { ...credentials, [name]: '' }
    const result = spawnSync(process.execPath, ['-e', 'require("./scripts/release-guard.mts").default()'], {
      env,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0)
    assert.ok(result.stderr.includes(`Release requires ${name}`))
    assert.ok(!result.stderr.includes('test-placeholder'))
  }
})

test('release guard accepts complete credentials', () => {
  const result = spawnSync(process.execPath, ['-e', 'require("./scripts/release-guard.mts").default()'], {
    env: credentials,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
})
