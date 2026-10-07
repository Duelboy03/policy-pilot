import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4175', channel: 'chrome', viewport: { width: 1360, height: 860 } },
  webServer: {
    command: 'npm run build -w @policypilot/web && npm exec -w @policypilot/web -- vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
