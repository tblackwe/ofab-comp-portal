import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Worker tests run inside the Workers runtime against an in-memory R2 bucket.
export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { SITE_PASSCODE: 'Test-Pass', ADMIN_PASSCODE: 'Admin-Pass-123' } },
    }),
  ],
  test: {
    include: ['test/worker/**/*.test.js', 'test/unit/**/*.test.js'],
  },
})
