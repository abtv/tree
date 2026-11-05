import { defineConfig } from '@playwright/test'
import regression from './playwright.config'
import { linuxFiles, linuxTag, sharedFiles, sharedClipboardTag, specPattern } from './electron-platforms'

// The ordinary local macOS command still runs the full suite.
export default defineConfig({
  ...regression,
  workers: 4,
  retries: 0,
  projects: [
    {
      name: 'linux',
      testMatch: specPattern([...linuxFiles, ...sharedFiles]),
    },
    {
      name: 'linux-functional',
      testIgnore: specPattern([...linuxFiles, ...sharedFiles, 'shared-application-memory.spec.ts']),
      grep: linuxTag,
    },
    {
      name: 'linux-clipboard',
      testMatch: /\/clipboard\.spec\.ts$/,
      // Native image clipboard and pointer selection remain macOS-owned. This overlap
      // exercises real text clipboard ownership through both editor modes.
      grep: sharedClipboardTag,
    },
  ],
})
