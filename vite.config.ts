/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Cross-origin isolation enables SharedArrayBuffer, which lets the WASM backend use
 * several CPU threads (much faster on machines without WebGPU). `credentialless` still
 * allows loading models from the Hugging Face CDN. Production hosts need the same headers
 * (see public/_headers and vercel.json).
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

/** Local dev/preview only: serve downloaded test models at /test-models/ (see scripts/fetch-test-model.sh). */
function testModels(): Plugin {
  const root = path.resolve(import.meta.dirname, 'tests/fixtures/models');
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const file = path.join(root, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Length', statSync(file).size);
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'kotha-test-models',
    configureServer(server) {
      server.middlewares.use('/test-models', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/test-models', middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), testModels()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2022' },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
