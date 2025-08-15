import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import svgr from 'vite-plugin-svgr';  // Import the svgr plugin

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    svgr(),  // Add the svgr plugin here
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // Alias for @
    },
  },
  build: {
    outDir: 'dist', // Where to put the built files
    assetsDir: 'assets', // Directory for assets like images, fonts, etc.
    sourcemap: true, // Enable source maps for debugging in development
  },
  server: {
    hmr: {
      overlay: false, // Disable the full-screen error overlay
    },
    port: 5173, // Optional: You can specify a port if needed
    open: true, // Optional: Automatically open the browser when the dev server starts
  },
});
