import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies /api to the DASH-003 Express server so the dev server doesn't need CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
