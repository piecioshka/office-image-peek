import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { cspPlugin } from './vite/csp-plugin.ts';
import { swPlugin } from './vite/sw-plugin.ts';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), cspPlugin(), swPlugin()],
  server: { host: '127.0.0.1', cors: false },
});
