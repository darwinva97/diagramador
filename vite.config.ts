import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// singlefile: un único index.html (con rutas del router, se sirve con fallback SPA; ya no vale file://).
export default defineConfig({
  base: '/',
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100_000_000 },
});
