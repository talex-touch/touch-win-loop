import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('./', import.meta.url))
const appDir = fileURLToPath(new URL('./app/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~': appDir,
      '~~': rootDir,
    },
  },
  test: {
    include: [
      'scripts/tests/**/*.{test,spec}.{js,mjs,ts,mts}',
    ],
    exclude: [
      'scripts/tests/team-project-e2e.smoke.spec.mjs',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportOnFailure: true,
      include: [
        'server/utils/api-handler.ts',
        'server/utils/team-first.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 40,
      },
    },
  },
})
