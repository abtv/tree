// macOS takes the menu-bar application name from the Electron.app bundle, not from app.setName,
// so a development run would show "Electron". Rename the local bundle; a packaged build sets its own name.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'Tree'

if (process.platform === 'darwin') {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const plistPath = join(root, 'node_modules/electron/dist/Electron.app/Contents/Info.plist')
  // A missing bundle (for example before Electron is downloaded) is not an error for this cosmetic step.
  if (!existsSync(plistPath)) process.exit(0)
  const original = readFileSync(plistPath, 'utf8')
  const renamed = original.replace(
    /(<key>(?:CFBundleName|CFBundleDisplayName)<\/key>\s*<string>)[^<]*(<\/string>)/g,
    `$1${APP_NAME}$2`,
  )
  if (renamed !== original) writeFileSync(plistPath, renamed)
}
