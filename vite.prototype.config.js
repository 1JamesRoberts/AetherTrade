import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// An explicit opt-in build. The normal production build keeps its existing entry.
export default defineConfig({
  root: 'prototype',
  base: '/prototype/',
  plugins: [react()],
  build: { outDir: '../dist-prototype', emptyOutDir: true },
});
