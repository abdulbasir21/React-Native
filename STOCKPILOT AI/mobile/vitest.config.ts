import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'expo-secure-store': path.resolve(__dirname, './src/tests/mocks/expo-secure-store.ts'),
      'expo-crypto': path.resolve(__dirname, './src/tests/mocks/expo-crypto.ts'),
      'expo-print': path.resolve(__dirname, './src/tests/mocks/expo-print.ts'),
      'expo-sharing': path.resolve(__dirname, './src/tests/mocks/expo-sharing.ts'),
      'expo-sqlite': path.resolve(__dirname, './src/tests/mocks/expo-sqlite.ts'),
    },
  },
});
