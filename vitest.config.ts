import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: { provider: 'v8', include: ['packages/core/src/**', 'apps/server/src/**'], exclude: ['**/*.test.*', '**/index.ts', '**/transformers.ts', '**/node.ts', '**/generated/**', '**/main.ts'] },
  },
})
