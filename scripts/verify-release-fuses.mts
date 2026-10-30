import assert from 'node:assert/strict'
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses'

const app = process.argv[2]
if (!app) throw new Error('Provide a packaged .app path')
const wire = await getCurrentFuseWire(app)
for (const option of [
  FuseV1Options.RunAsNode,
  FuseV1Options.EnableNodeOptionsEnvironmentVariable,
  FuseV1Options.EnableNodeCliInspectArguments,
  FuseV1Options.GrantFileProtocolExtraPrivileges,
]) {
  assert.equal(wire[option], 48, `Fuse ${FuseV1Options[option]} must be disabled`)
}
for (const option of [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseV1Options.OnlyLoadAppFromAsar]) {
  assert.equal(wire[option], 49, `Fuse ${FuseV1Options[option]} must be enabled`)
}
console.log('Packaged Electron fuses verified')
