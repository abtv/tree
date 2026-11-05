import { defineConfig } from '@playwright/test'
import regression from './playwright.config'

// A bounded portability pilot. The ordinary macOS command still runs the full suite.
export default defineConfig({
  ...regression,
  workers: 4,
  retries: 0,
  projects: [
    {
      name: 'linux',
      testMatch: /\/(?:initial-state|tab-structure|notes-archive-boundary|shared-application)\.spec\.ts$/,
    },
    {
      name: 'linux-clipboard',
      testMatch: /\/clipboard\.spec\.ts$/,
      // Native image clipboard and pointer selection remain macOS-owned. This pilot
      // exercises real text clipboard ownership through both editor modes.
      grep: /pastes plain text at the cursor|cuts a hyperlink and pastes it into another node/,
    },
  ],
})
