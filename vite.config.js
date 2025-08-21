// vite.config.ts
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
import {fileURLToPath} from 'url';
import {dirname,resolve} from 'path';

// Ensure __dirname works in ESM (Windows-safe)
const __filename=fileURLToPath(import.meta.url);
const __dirname=dirname(__filename);

export default defineConfig({
  plugins:[react(),tailwind(),svgr()],
  resolve:{
    alias:{'@':resolve(__dirname,'src')}
  },
  build:{
    outDir:'dist',
    assetsDir:'assets',
    sourcemap:true
  },
  server:{
    hmr:{overlay:false},
    port:5173,
    open:true
  }
});
