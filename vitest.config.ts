import { defineConfig } from 'vitest/config';

// Lock timezone for deterministic day-segmentation tests. Italy/Slovenia is the
// real-world target for the May trip; CEST is UTC+2 in early May.
process.env.TZ = process.env.TZ ?? 'Europe/Ljubljana';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/db.ts', 'src/lib/locationTask.ts', 'src/lib/types.ts', 'src/lib/theme.ts'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      reporter: ['text', 'html'],
    },
  },
});
