import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Raikes-Hacks-2026/',
  server: { port: 3004 },
});
