import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('loads the release candidate checker without installed npm dependencies', () => {
  const moduleUrl = pathToFileURL(resolve('scripts/web-release/status.mts')).href
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import { registerHooks } from 'node:module'
        registerHooks({
          resolve(specifier, context, nextResolve) {
            if (!/^(node:|file:|\\.)/.test(specifier)) {
              throw new Error('Unexpected npm dependency: ' + specifier)
            }
            return nextResolve(specifier, context)
          }
        })
        await import(${JSON.stringify(moduleUrl)})
      `,
    ],
    { encoding: 'utf8', timeout: 10000 },
  )

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
})
