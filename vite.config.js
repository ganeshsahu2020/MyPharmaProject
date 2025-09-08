import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const useSupabaseProxy = env.VITE_USE_SUPABASE_PROXY === 'true';

  let supabaseOrigin;
  try {
    if (env.VITE_SUPABASE_ORIGIN) {
      supabaseOrigin = env.VITE_SUPABASE_ORIGIN;
    } else if (env.VITE_SUPABASE_URL) {
      const url = new URL(env.VITE_SUPABASE_URL);
      supabaseOrigin = url.origin;
      if (useSupabaseProxy && supabaseOrigin.includes('localhost')) {
        supabaseOrigin = env.VITE_SUPABASE_ORIGIN || undefined;
      }
    }
  } catch (error) {
    console.error('Error while resolving Supabase URL:', error);
  }

  const proxy = (useSupabaseProxy && supabaseOrigin)
    ? {
        '/supabase': {
          target: supabaseOrigin,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/supabase/, ''),
        },
      }
    : undefined;

  return {
    plugins: [react(), tailwind(), svgr()],
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    build: { outDir: 'dist', assetsDir: 'assets', sourcemap: true }, // add sourcemap: 'inline' for development too if needed
    server: {
      hmr: { overlay: false },
      port: 5173,
      strictPort: false,
      open: true,
      cors: true,
      proxy,
    },
    optimizeDeps: { include: ['react', 'react-dom'] },
  };
});
