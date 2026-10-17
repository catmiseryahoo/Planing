import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/motion/') || id.includes('/node_modules/framer-motion/')) {
            return 'motion'
          }
          if (id.includes('/node_modules/')) {
            return 'vendor'
          }
        }
      }
    }
  }
})
