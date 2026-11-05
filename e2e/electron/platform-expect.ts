import { expect as playwrightExpect } from '@playwright/test'

function rejectSnapshot(): never {
  throw new Error('Snapshot assertions belong to the macOS Electron suite; remove this case from Linux allocation.')
}

export function createPlatformExpect(platform: NodeJS.Platform): typeof playwrightExpect {
  return platform === 'linux'
    ? playwrightExpect.extend({ toHaveScreenshot: rejectSnapshot, toMatchSnapshot: rejectSnapshot })
    : playwrightExpect
}

export const expect = createPlatformExpect(process.platform)
