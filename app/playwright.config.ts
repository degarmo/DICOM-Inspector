import { defineConfig } from '@playwright/test'

/** End-to-end runs against the built app (npm run build first). Electron needs no browser downloads. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
})
