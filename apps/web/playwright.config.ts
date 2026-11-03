import { defineConfig } from '@playwright/test';

/**
 * E2E and 3D smoke tests. Not part of `npm test` (needs a browser); run with
 * `npm run test:e2e -w @netsim/web`. Starts the API and web dev servers unless already running.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    // Software WebGL so the 3D smoke test runs on machines and CI runners without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev',
    cwd: '../..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
