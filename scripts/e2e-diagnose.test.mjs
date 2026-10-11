import { describe, expect, it } from 'vitest'
import { diagnosticOptions, runDiagnostics } from './e2e-diagnose.mjs'

describe('E2E diagnostic command', () => {
  it('forwards specs and flags intact while mapping only named diagnostic options', () => {
    const result = diagnosticOptions(
      [
        '--shared-reset=window',
        '--memory-burst-size=32',
        '--json-output=/private/tmp/report.json',
        'e2e/navigation.spec.ts',
        '--workers=6',
        '--repeat-each=5',
        '--reporter=dot,json',
        '--grep',
        'a $literal; pattern',
      ],
      { PATH: '/bin' },
    )
    expect(result.env).toEqual({
      PATH: '/bin',
      TREE_E2E_SHARED_RESET: 'window',
      TREE_E2E_MEMORY_BURST_SIZE: '32',
      PLAYWRIGHT_JSON_OUTPUT_NAME: '/private/tmp/report.json',
    })
    expect(result.args).toEqual([
      'run',
      'test:e2e',
      '--',
      'e2e/navigation.spec.ts',
      '--workers=6',
      '--repeat-each=5',
      '--reporter=dot,json',
      '--grep',
      'a $literal; pattern',
    ])
  })

  it('allows a fresh-process control even when the parent opted into reuse', () => {
    const inherited = { TREE_E2E_SHARED_RESET: 'reload' }
    expect(diagnosticOptions(['--shared-reset=fresh'], inherited).env).toEqual({ TREE_E2E_SHARED_RESET: 'off' })
    expect(inherited.TREE_E2E_SHARED_RESET).toBe('reload')
    expect(diagnosticOptions(['--shared-reset=reload'], {}).env.TREE_E2E_SHARED_RESET).toBe('reload')
  })

  it.each([
    '--shared-reset=other',
    '--memory-burst-size=0',
    '--memory-burst-size=-1',
    '--memory-burst-size=1.5',
    '--memory-burst-size=9007199254740992',
    '--json-output=',
    '--shared-reset',
    '--memory-burst-size',
    '--json-output',
  ])('rejects malformed setting %s before launching', (arg) => {
    let launched = false
    expect(() =>
      runDiagnostics([arg], () => {
        launched = true
      }),
    ).toThrow()
    expect(launched).toBe(false)
  })

  it('invokes the existing build/test workflow without shell interpretation and preserves failure', () => {
    expect(
      runDiagnostics(['--list'], (command, args, options) => {
        expect(command).toBe('npm')
        expect(args).toEqual(['run', 'test:e2e', '--', '--list'])
        expect(options.shell).toBeUndefined()
        expect(options.stdio).toBe('inherit')
        return { status: 7 }
      }),
    ).toBe(7)
    expect(runDiagnostics([], () => ({ status: null, signal: 'SIGTERM' }))).toBe(1)
    expect(() => runDiagnostics([], () => ({ error: new Error('spawn failed') }))).toThrow('spawn failed')
  })
})
