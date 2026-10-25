import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// E2E=1 runs fully offline: a local R2 bucket seeded with test fixtures instead of the real one.
const e2e = process.env.E2E === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare(e2e ? { remoteBindings: false, persistState: { path: '.wrangler/e2e' } } : {})],
})
