import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/standalone.ts'),
      name: 'ODataUI',
      formats: ['iife'],
      fileName: () => 'odata-ui.standalone.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: 'default',
      },
    },
  },
});
