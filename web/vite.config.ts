import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths plus hash routing let the build run from any static host
// or sub-folder without server rewrite rules.
export default defineConfig({
  base: './',
  plugins: [react()],
});
