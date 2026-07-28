import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'od-preview-build',
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: 'od-preview.html',
      output: {
        codeSplitting: false,
        entryFileNames: 'assets/od-preview.js',
        assetFileNames: 'assets/od-preview.[ext]'
      }
    }
  }
});
