import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `fileURLToPath` on a directory URL ends with a separator.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const extensionRoot = path.join(repoRoot, 'extension');

/**
 * Dev convenience: serve popup.html at `/` so the sandbox preview URL opens
 * the popup directly (build output is unaffected — MV3 loads popup.html).
 */
function servePopupAtRoot() {
  return {
    name: 'pageclone-serve-popup-at-root',
    configureServer(server: {
      middlewares: {
        use: (fn: (req: { url?: string }, res: never, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/popup.html';
        next();
      });
    },
  };
}

export default defineConfig({
  root: extensionRoot,
  // Relative asset URLs — required for reliable loading from
  // chrome-extension:// origins (MV3 best practice).
  base: './',
  plugins: [react(), servePopupAtRoot()],

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
        content: path.join(extensionRoot, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
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
