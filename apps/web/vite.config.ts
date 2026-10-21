import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
  build: {
    outDir: 'dist',
    // The server's CSP allows fonts from 'self' only (no data: URIs), so no asset may be inlined.
    assetsInlineLimit: 0,
  },
});
