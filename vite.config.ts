import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// singlefile: un único index.html (con rutas del router, se sirve con fallback SPA; ya no vale file://).
export default defineConfig({
  base: '/',
  // el plugin fuerza base './' en su config recomendada; overrideConfig se aplica después y la devuelve a '/'
  plugins: [react(), viteSingleFile({ overrideConfig: { base: '/' } })],
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100_000_000 },
});
