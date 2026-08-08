import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      all: true,
      exclude: [],
      include: ['src/**/*.ts'],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85
      }
    },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true
  }
});
