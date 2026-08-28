import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Hardcoded 'localhost:5000' only resolves for the plain
      // `npm run dev` workflow. Inside the Dockerized `web` dev container
      // (docker-compose.dev.yml), 'localhost' means the web container
      // itself — nothing listens on :5000 there — so every /api request
      // 500'd at the proxy layer despite the real `api` container working
      // fine (verified directly against its exposed port). Docker Compose
      // sets VITE_API_PROXY_TARGET=http://api:5000 (the service's
      // Docker-DNS name) for that service; bare `npm run dev` never sets
      // it, so it falls back to the exact previous behavior.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
