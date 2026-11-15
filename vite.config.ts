import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react(), tailwindcss()],
  // PGlite ships its own WebAssembly and data files, which the pre-bundler must leave alone.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { root: '.', include: ['tests/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 60_000 },
});
