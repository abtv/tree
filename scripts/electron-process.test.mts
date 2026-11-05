import { expect, it } from 'vitest'
import { isOwnedElectronCommand } from '../e2e/electron/electron-process'

it('cleans owned macOS helpers only from the same Electron bundle', () => {
  const bundle = '/work with spaces/node_modules/electron/dist/Electron.app'
  const executable = `${bundle}/Contents/MacOS/Electron`

  for (const suffix of ['', ' (Renderer)', ' (GPU)', ' (Plugin)']) {
    const helper = `${bundle}/Contents/Frameworks/Electron Helper${suffix}.app/Contents/MacOS/Electron Helper${suffix}`
    const command = `${helper} --type=renderer --user-data-dir=/tmp/tree-e2e-p42-abcd`

    expect(isOwnedElectronCommand(command, 'tree-e2e-p42-', executable)).toBe(true)
    expect(isOwnedElectronCommand(command, 'tree-e2e-p4-', executable)).toBe(false)
    expect(isOwnedElectronCommand(command.replace(bundle, '/other/Electron.app'), 'tree-e2e-', executable)).toBe(false)
    expect(
      isOwnedElectronCommand(`${helper}-other --user-data-dir=/tmp/tree-e2e-p42-abcd`, 'tree-e2e-', executable),
    ).toBe(false)
  }
})

it.each(['/work/node_modules/electron/dist/electron', '/work with spaces/Electron.app/Contents/MacOS/Electron'])(
  'matches only the owned Electron executable and user-data directory (%s)',
  (executable) => {
    const command = `${executable} --user-data-dir=/tmp/tree-e2e-p42-abcd entry.cjs`

    expect(isOwnedElectronCommand(command, 'tree-e2e-p42-', executable)).toBe(true)
    expect(isOwnedElectronCommand(command, 'tree-e2e-', executable)).toBe(true)
    expect(isOwnedElectronCommand(command, 'tree-e2e-p4-', executable)).toBe(false)
    expect(isOwnedElectronCommand(command, '', executable)).toBe(false)
    expect(isOwnedElectronCommand(command, 'tree-e2e', executable)).toBe(false)
    expect(isOwnedElectronCommand(`/usr/bin/node ${command}`, 'tree-e2e-', executable)).toBe(false)
    expect(
      isOwnedElectronCommand(`${executable}-other --user-data-dir=/tmp/tree-e2e-p42-abcd`, 'tree-e2e-', executable),
    ).toBe(false)
    expect(isOwnedElectronCommand(`${executable} --title=tree-e2e-p42-abcd`, 'tree-e2e-', executable)).toBe(false)
    expect(
      isOwnedElectronCommand(`${executable} --user-data-dir=/tmp/tree-e2e-p42-abcd/personal`, 'tree-e2e-', executable),
    ).toBe(false)
    expect(
      isOwnedElectronCommand(`${executable} --user-data-dir=/tmp/personal tree-e2e-p42-abcd`, 'tree-e2e-', executable),
    ).toBe(false)
  },
)
