import { defineConfig } from '@playwright/test'
import regression from './playwright.config'
import { linuxFiles, linuxTag, specPattern } from './electron-platforms'

export default defineConfig({
  ...regression,
  projects: regression.projects!.map((project) => ({
    ...project,
    testIgnore: [
      ...(Array.isArray(project.testIgnore) ? project.testIgnore : project.testIgnore ? [project.testIgnore] : []),
      specPattern(linuxFiles),
    ],
    grepInvert: linuxTag,
  })),
})
