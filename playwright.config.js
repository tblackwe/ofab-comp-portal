import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The dev server reads SITE_PASSCODE from .dev.vars; create one for CI, reuse yours locally.
if (!existsSync('.dev.vars')) writeFileSync('.dev.vars', 'SITE_PASSCODE=e2e-passcode\n')
process.env.E2E_PASSCODE = readFileSync('.dev.vars', 'utf8').match(/^SITE_PASSCODE=(.*)$/m)?.[1].trim()

const PORT = 5180

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Google Chrome, not the bundled Chromium, which can't play H.264/AAC.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node test/e2e/seed.mjs && vite --port ${PORT} --strictPort`,
    env: { E2E: '1' },
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
