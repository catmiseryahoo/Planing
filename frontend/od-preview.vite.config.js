import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_OD_PREVIEW': JSON.stringify('true'),
  },
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
