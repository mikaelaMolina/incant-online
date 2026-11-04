import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    // Known large vendor chunks: three (~530 kB) and rapier3d-compat (~4.3 MB, WASM inlined
    // as base64, ~1.6 MB gzipped). Warn only if something grows past those.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], rapier: ['@dimforge/rapier3d-compat'] },
      },
    },
  },
});
