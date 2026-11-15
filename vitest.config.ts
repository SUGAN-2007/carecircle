import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use 'node' environment for server-side logic (most of our tests).
    // Individual test files can override with @vitest-environment jsdom.
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.test.ts', 'tests/**'],
    },
  },
  resolve: {
    alias: {
      // Mirror tsconfig paths so imports like '@/lib/env' work in tests
      '@': path.resolve(__dirname, '.'),
    },
  },
});
