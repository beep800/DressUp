import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths plus hash routing let the build run from any static host
// or sub-folder without server rewrite rules.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Requests to /n8n/... are forwarded to n8n, so the browser talks to one origin
  // and n8n needs no CORS settings. Applies to both `npm run dev` and `npm run preview`.
  const proxy = {
    '/n8n': {
      target: env.N8N_URL || 'http://localhost:5678',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/n8n/, ''),
    },
  };

  return {
    base: './',
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  };
});
