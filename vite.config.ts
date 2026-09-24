import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `fileURLToPath` on a directory URL ends with a separator.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const extensionRoot = path.join(repoRoot, 'extension');

export default defineConfig({
  root: extensionRoot,
  // Relative asset URLs — required for reliable loading from
  // chrome-extension:// origins (MV3 best practice).
  base: './',
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.join(extensionRoot, 'src'),
    },
  },

  server: {
    host: true,
    port: 5173,
    // Allow the sandboxed live-preview host.
    allowedHosts: true,
  },

  build: {
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: path.join(extensionRoot, 'popup.html'),
        background: path.join(extensionRoot, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },

  test: {
    globals: true,
    // Clear mock call history between tests; listener registries in
    // tests/chromeMock.ts intentionally live outside vi.fn call history.
    clearMocks: true,
    environment: 'jsdom',
    include: [`${repoRoot}tests/**/*.test.{ts,tsx}`, `${repoRoot}extension/src/**/*.test.{ts,tsx}`],
    setupFiles: [`${repoRoot}tests/setup.ts`],
    css: false,
  },
});
