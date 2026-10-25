import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The dev server reads the passcodes from .dev.vars; fill in any missing ones (CI), reuse yours locally.
let vars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : ''
const before = vars
if (vars && !vars.endsWith('\n')) vars += '\n'
if (!/^SITE_PASSCODE=/m.test(vars)) vars += 'SITE_PASSCODE=e2e-passcode\n'
if (!/^ADMIN_PASSCODE=/m.test(vars)) vars += 'ADMIN_PASSCODE=e2e-admin-passcode\n'
if (vars.trim() !== before.trim()) writeFileSync('.dev.vars', vars)
process.env.E2E_PASSCODE = vars.match(/^SITE_PASSCODE=(.*)$/m)?.[1].trim()
process.env.E2E_ADMIN_PASSCODE = vars.match(/^ADMIN_PASSCODE=(.*)$/m)?.[1].trim()

const PORT = 5180

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  // Tests share one local bucket; the admin test adds and removes a performance.
  workers: 1,
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
