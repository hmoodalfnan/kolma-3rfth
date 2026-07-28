import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // The project is plain JavaScript, so JSX lives in .js files. Vite's default
  // esbuild loader treats .js as plain JS and fails to parse the JSX, so widen it.
  esbuild: { loader: 'jsx', include: /\.[jt]sx?$/, exclude: [] },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    globals: true,
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: { '@': path.resolve(process.cwd()) },
  },
});
