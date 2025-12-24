
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // استفاده از مسیر نسبی برای سازگاری با GitHub Pages
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY)
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1000
  }
});
