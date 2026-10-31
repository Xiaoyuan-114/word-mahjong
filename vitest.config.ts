import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/test/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
  },
});
