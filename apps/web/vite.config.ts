import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 127.0.0.1, not localhost: on Windows localhost can resolve to ::1 while the API listens on IPv4.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  // Playwright specs in e2e/ need a browser; they run with `npm run test:e2e`.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
