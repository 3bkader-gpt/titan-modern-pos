import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: path.resolve('src/renderer'),
  base: './',
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true,
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': path.resolve('src/renderer/src'),
      '@shared': path.resolve('src/shared')
    }
  }
});
