import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  // Playwright specs in e2e/ need a browser; they run with `npm run test:e2e`.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
