import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Development is same-origin: Vite proxies /api to the Spring Boot service, so the browser
// never makes a cross-origin request and no CORS configuration has to exist (research R2).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
