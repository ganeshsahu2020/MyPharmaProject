import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),  // React plugin for JSX support
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // Setting up alias for imports
    },
  },
  build: {
    outDir: 'dist',  // Make sure output is placed in dist
    assetsDir: 'assets',
  },
})
