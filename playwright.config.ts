import { defineConfig } from '@playwright/test'

// E2E do app Electron compilado (rode `npm run build` antes).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
})
