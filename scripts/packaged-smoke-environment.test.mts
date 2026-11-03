import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { packagedSmokeEnvironment } from './packaged-smoke-environment.mts'

test('packaged child receives only startup variables, never inherited credentials', () => {
  const startup = { PATH: '/usr/bin:/bin', HOME: '/synthetic-home', TMPDIR: '/synthetic-tmp', LANG: 'en_US.UTF-8' }
  const environment = packagedSmokeEnvironment({
    ...startup,
    CSC_LINK: 'synthetic-certificate',
    CSC_KEY_PASSWORD: 'synthetic-password',
    APPLE_API_KEY: '/synthetic-key.p8',
    APPLE_API_KEY_BASE64: 'synthetic-key',
    APPLE_API_KEY_ID: 'synthetic-key-id',
    APPLE_API_ISSUER: 'synthetic-issuer',
    GH_TOKEN: 'synthetic-token',
    GITHUB_TOKEN: 'synthetic-token',
    ACTIONS_RUNTIME_TOKEN: 'synthetic-token',
    FUTURE_SECRET: 'synthetic-secret',
    NODE_OPTIONS: '--require=untrusted-module',
  })

  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], {
    env: environment,
    encoding: 'utf8',
  })

  expect(child.status).toBe(0)
  expect(environment).toEqual(startup)
  const received = JSON.parse(child.stdout) as Record<string, string>
  // macOS may add its text encoding variable during process startup.
  delete received.__CF_USER_TEXT_ENCODING
  expect(received).toEqual(startup)
  expect(packagedSmokeEnvironment({})).toEqual({})
})
