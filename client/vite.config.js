import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBackendUrl() {
  if (process.env.VITE_API_PROXY) return process.env.VITE_API_PROXY;
  try {
    const envPath = path.resolve(__dirname, '../server/.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const portMatch = content.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) return `http://localhost:${portMatch[1]}`;
    }
  } catch {
    /* fallback below */
  }
  return 'http://localhost:5000';
}

const API = getBackendUrl();

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
});
