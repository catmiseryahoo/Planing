import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Open Design's powered preview serves frontend/index.html through its native
// Vite bridge and substitutes the sibling dist/index.html. Compile the
// preview-only data branch without changing the normal application entry.
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_OD_PREVIEW': JSON.stringify('true'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
  },
});
